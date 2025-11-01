// Constants
const CONSTANTS = {
    MAX_TEXT_LENGTH: 5000,
    MAX_DURATION: 600,
    MIN_DURATION: 1,
    TOAST_DURATION: 3000,
    UNDO_TIMEOUT: 5000,
    SEARCH_DEBOUNCE: 300
};

// Supabase Configuration - read from environment variables or window variables
const SUPABASE_URL = window.SUPABASE_URL || 'https://hgmnpvmabvtztdwovndd.supabase.co';
const SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhnbW5wdm1hYnZ0enRkd292bmRkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE5ODk2MTYsImV4cCI6MjA3NzU2NTYxNn0.9q7qng21H58g_eJ3mZBLl93HL0ZEtzfgXdm-MGZe5RI';

// Initialize Supabase client (will be initialized after DOM loads)
let supabaseClient = null;

// Utility functions
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function escapeRegex(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function sanitizeInput(text, maxLength = CONSTANTS.MAX_TEXT_LENGTH) {
    if (!text) return '';
    const trimmed = text.trim();
    return trimmed.length > maxLength ? trimmed.substring(0, maxLength) : trimmed;
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Safe text rendering with highlight
function highlightSearch(text, searchTerm) {
    if (!text) return '';
    if (!searchTerm) return escapeHtml(text);
    
    const escapedText = escapeHtml(text);
    const escapedSearch = escapeRegex(searchTerm);
    
    try {
        const regex = new RegExp(`(${escapedSearch})`, 'gi');
        return escapedText.replace(regex, '<span class="highlight">$1</span>');
    } catch (e) {
        console.error('Regex error:', e);
        return escapedText;
    }
}

// Data Management Classes
class GameManager {
    constructor() {
        this.games = [];
        this.currentEditId = null;
        this.searchTerm = '';
        this.undoTimeout = null;
        this.deletedGame = null;
        this.loading = false;
        // Don't call init() here - will be called explicitly after Supabase is ready
    }

    async init() {
        await this.loadGames();
    }

    async loadGames() {
        this.loading = true;
        console.log('📥 Start loading games...', { supabaseClient: !!supabaseClient });
        try {
            if (supabaseClient) {
                console.log('📥 Loading from Supabase...');
                // Load from Supabase
                const { data, error } = await supabaseClient
                    .from('games')
                    .select('*')
                    .order('created_at', { ascending: false });
                
                console.log('📥 Supabase response:', { data, error });
                
                if (error) {
                    console.error('❌ Error loading games from Supabase:', error);
                    console.error('Error details:', {
                        message: error.message,
                        code: error.code,
                        details: error.details,
                        hint: error.hint
                    });
                    showToast(`Fout bij laden games: ${error.message}`, 'error');
                    // Fallback to localStorage
                    this.loadGamesFromLocalStorage();
                } else {
                    console.log(`✅ Loaded ${data?.length || 0} games from Supabase`);
                    // Convert database format to app format
                    this.games = (data || []).map(game => ({
                        id: game.id,
                        name: game.name || '',
                        position: game.position || '',
                        invariant: game.invariant || '',
                        taskPlayerA: game.task_player_a || '',
                        taskPlayerB: game.task_player_b || '',
                        differentiation: game.differentiation || '',
                        createdAt: game.created_at,
                        updatedAt: game.updated_at
                    }));
                    console.log('✅ Games converted:', this.games.length);
                    updateStats();
                }
            } else {
                console.warn('⚠️ Supabase client niet beschikbaar, gebruik localStorage');
                this.loadGamesFromLocalStorage();
            }
        } catch (e) {
            console.error('❌ Error loading games:', e);
            this.loadGamesFromLocalStorage();
        } finally {
            this.loading = false;
        }
    }

    loadGamesFromLocalStorage() {
        const stored = localStorage.getItem('bjjGames');
        if (stored) {
            try {
                this.games = JSON.parse(stored);
                if (!Array.isArray(this.games)) {
                    this.games = [];
                }
            } catch (e) {
                console.error('Error parsing localStorage:', e);
                this.games = [];
            }
        }
    }

    async saveToStorage() {
        try {
            if (supabaseClient) {
                // Sync to Supabase
                localStorage.setItem('lastSaved', new Date().toISOString());
                updateStats();
                showToast('Games opgeslagen!', 'success');
            } else {
                // Fallback to localStorage
                localStorage.setItem('bjjGames', JSON.stringify(this.games));
                localStorage.setItem('lastSaved', new Date().toISOString());
                updateStats();
                showToast('Games opgeslagen!', 'success');
            }
        } catch (e) {
            console.error('Error saving games:', e);
            showToast('Fout bij opslaan van games', 'error');
        }
    }

    async addGame(game) {
        try {
            if (supabaseClient) {
                console.log('💾 Probeer game op te slaan in Supabase...', game);
                // Save to Supabase
                const { data, error } = await supabaseClient
                    .from('games')
                    .insert({
                        name: game.name || '',
                        position: game.position || '',
                        invariant: game.invariant || '',
                        task_player_a: game.taskPlayerA || '',
                        task_player_b: game.taskPlayerB || '',
                        differentiation: game.differentiation || ''
                    })
                    .select()
                    .single();
                
                if (error) {
                    console.error('❌ Supabase insert error:', error);
                    console.error('Error details:', {
                        message: error.message,
                        code: error.code,
                        details: error.details,
                        hint: error.hint
                    });
                    throw error;
                }
                
                console.log('✅ Game succesvol opgeslagen in Supabase:', data);
                
                // Convert to app format
                const newGame = {
                    id: data.id,
                    name: data.name || '',
                    position: data.position || '',
                    invariant: data.invariant || '',
                    taskPlayerA: data.task_player_a || '',
                    taskPlayerB: data.task_player_b || '',
                    differentiation: data.differentiation || '',
                    createdAt: data.created_at,
                    updatedAt: data.updated_at
                };
                
                this.games.unshift(newGame);
                await this.saveToStorage();
                renderGames();
                renderAvailableGames();
                showToast('Game opgeslagen in database!', 'success');
            } else {
                console.warn('⚠️ Supabase client niet beschikbaar, gebruik localStorage fallback');
                // Fallback to localStorage
                game.id = Date.now().toString(36) + Math.random().toString(36).substring(2);
                game.createdAt = new Date().toISOString();
                game.updatedAt = new Date().toISOString();
                this.games.unshift(game);
                await this.saveToStorage();
                renderGames();
                renderAvailableGames();
                showToast('Game opgeslagen lokaal (Supabase niet beschikbaar)', 'warning');
            }
        } catch (e) {
            console.error('❌ Error adding game:', e);
            const errorMsg = e?.message || e?.error?.message || 'Onbekende fout';
            console.error('Error details:', e);
            showToast(`Fout bij toevoegen: ${errorMsg}`, 'error');
            throw e; // Re-throw zodat de caller weet dat het mislukt is
        }
    }

    async updateGame(id, updates) {
        try {
            if (supabaseClient) {
                // Update in Supabase
                const { data, error} = await supabaseClient
                    .from('games')
                    .update({
                        name: updates.name || '',
                        position: updates.position || '',
                        invariant: updates.invariant || '',
                        task_player_a: updates.taskPlayerA || '',
                        task_player_b: updates.taskPlayerB || '',
                        differentiation: updates.differentiation || ''
                    })
                    .eq('id', id)
                    .select()
                    .single();
                
                if (error) {
                    throw error;
                }
                
                // Update local array
                const index = this.games.findIndex(g => g.id === id);
                if (index !== -1) {
                    this.games[index] = {
                        id: data.id,
                        name: data.name || '',
                        position: data.position || '',
                        invariant: data.invariant || '',
                        taskPlayerA: data.task_player_a || '',
                        taskPlayerB: data.task_player_b || '',
                        differentiation: data.differentiation || '',
                        createdAt: data.created_at,
                        updatedAt: data.updated_at
                    };
                    await this.saveToStorage();
                    renderGames();
                    renderAvailableGames();
                }
            } else {
                // Fallback to localStorage
                const index = this.games.findIndex(g => g.id === id);
                if (index !== -1) {
                    this.games[index] = {
                        ...this.games[index],
                        ...updates,
                        updatedAt: new Date().toISOString()
                    };
                    await this.saveToStorage();
                    renderGames();
                    renderAvailableGames();
                }
            }
        } catch (e) {
            console.error('❌ Error updating game:', e);
            const errorMsg = e?.message || e?.error?.message || 'Onbekende fout';
            console.error('Error details:', e);
            showToast(`Fout bij bijwerken: ${errorMsg}`, 'error');
        }
    }

    async deleteGame(id) {
        try {
            if (supabaseClient) {
                // Delete from Supabase
                const { error } = await supabaseClient
                    .from('games')
                    .delete()
                    .eq('id', id);
                
                if (error) {
                    throw error;
                }
                
                // Remove from local array
                const index = this.games.findIndex(g => g.id === id);
                if (index !== -1) {
                    this.deletedGame = this.games[index];
                    this.games.splice(index, 1);
                    await this.saveToStorage();
                    renderGames();
                    renderAvailableGames();
                    showToast('Game verwijderd. Klik om ongedaan te maken.', 'error', true);
                }
            } else {
                // Fallback to localStorage
                const index = this.games.findIndex(g => g.id === id);
                if (index !== -1) {
                    this.deletedGame = this.games[index];
                    this.games.splice(index, 1);
                    await this.saveToStorage();
                    renderGames();
                    renderAvailableGames();
                    showToast('Game verwijderd. Klik om ongedaan te maken.', 'error', true);
                }
            }
        } catch (e) {
            console.error('❌ Error deleting game:', e);
            const errorMsg = e?.message || e?.error?.message || 'Onbekende fout';
            console.error('Error details:', e);
            showToast(`Fout bij verwijderen: ${errorMsg}`, 'error');
        }
    }

    async undoDelete() {
        if (this.deletedGame) {
            await this.addGame(this.deletedGame);
            this.deletedGame = null;
            showToast('Verwijdering ongedaan gemaakt', 'success');
        }
    }

    getFilteredGames(searchTerm = '', filterPosition = '', sortBy = 'newest') {
        let filtered = this.games;
        
        // Filter by search term
        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            filtered = filtered.filter(game => {
                return (
                    (game.name || '').toLowerCase().includes(term) ||
                    (game.position || '').toLowerCase().includes(term) ||
                    (game.invariant || '').toLowerCase().includes(term) ||
                    (game.taskPlayerA || '').toLowerCase().includes(term) ||
                    (game.taskPlayerB || '').toLowerCase().includes(term) ||
                    (game.differentiation || '').toLowerCase().includes(term)
                );
            });
        }
        
        // Filter by position
        if (filterPosition) {
            filtered = filtered.filter(game => {
                return (game.position || '').toLowerCase().includes(filterPosition.toLowerCase());
            });
        }
        
        // Sort
        filtered = [...filtered];
        switch(sortBy) {
            case 'oldest':
                filtered.sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
                break;
            case 'position':
                filtered.sort((a, b) => {
                    const posA = (a.position || '').toLowerCase();
                    const posB = (b.position || '').toLowerCase();
                    return posA.localeCompare(posB);
                });
                break;
            case 'updated':
                filtered.sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
                break;
            case 'newest':
            default:
                filtered.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
                break;
        }
        
        return filtered;
    }
    
    getUniquePositions() {
        const positions = new Set();
        this.games.forEach(game => {
            if (game.position) {
                const pos = game.position.trim();
                if (pos) positions.add(pos);
            }
        });
        return Array.from(positions).sort();
    }

    exportToJSON() {
        try {
            const dataStr = JSON.stringify(this.games, null, 2);
            const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
            const exportFileDefaultName = `bjj-games-${new Date().toISOString().split('T')[0]}.json`;
            
            const linkElement = document.createElement('a');
            linkElement.setAttribute('href', dataUri);
            linkElement.setAttribute('download', exportFileDefaultName);
            linkElement.click();
            
            showToast(`${this.games.length} games geëxporteerd`, 'success');
        } catch (e) {
            console.error('Export error:', e);
            showToast('Fout bij exporteren', 'error');
        }
    }

    async importFromJSON(file) {
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const imported = JSON.parse(e.target.result);
                if (Array.isArray(imported)) {
                    const confirmed = await showConfirm(
                        `Dit vervangt je huidige ${this.games.length} games met ${imported.length} geïmporteerde games. Doorgaan?`,
                        'Games importeren'
                    );
                    if (confirmed) {
                        this.games = imported;
                        this.saveToStorage();
                        renderGames();
                        renderAvailableGames();
                        showToast(`${imported.length} games geïmporteerd`, 'success');
                    }
                } else {
                    throw new Error('Invalid format');
                }
            } catch (error) {
                console.error('Import error:', error);
                showToast('Fout bij importeren: ongeldig bestand', 'error');
            }
        };
        reader.onerror = () => {
            showToast('Fout bij lezen van bestand', 'error');
        };
        reader.readAsText(file);
    }
}

class LessonManager {
    constructor() {
        this.lessons = [];
        this.currentEditId = null;
        this.currentViewId = null;
        this.selectedGames = [];
        this.undoTimeout = null;
        this.deletedLesson = null;
        this.loading = false;
        // Don't call init() here - will be called explicitly after Supabase is ready
    }

    async init() {
        await this.loadLessons();
    }

    async loadLessons() {
        this.loading = true;
        try {
            if (supabaseClient) {
                // Load from Supabase
                const { data, error } = await supabaseClient
                    .from('lessons')
                    .select('*')
                    .order('created_at', { ascending: false });
                
                if (error) {
                    console.error('Error loading lessons from Supabase:', error);
                    // Fallback to localStorage
                    this.loadLessonsFromLocalStorage();
                } else {
                    // Convert database format to app format
                    this.lessons = (data || []).map(lesson => ({
                        id: lesson.id,
                        name: lesson.name || '',
                        description: lesson.description || '',
                        duration: lesson.duration ? lesson.duration.toString() : '',
                        level: lesson.level || '',
                        notes: lesson.notes || '',
                        gameIds: lesson.game_ids || [],
                        createdAt: lesson.created_at,
                        updatedAt: lesson.updated_at
                    }));
                    updateStats();
                }
            } else {
                this.loadLessonsFromLocalStorage();
            }
        } catch (e) {
            console.error('Error loading lessons:', e);
            this.loadLessonsFromLocalStorage();
        } finally {
            this.loading = false;
        }
    }

    loadLessonsFromLocalStorage() {
        const stored = localStorage.getItem('bjjLessons');
        if (stored) {
            try {
                this.lessons = JSON.parse(stored);
                if (!Array.isArray(this.lessons)) {
                    this.lessons = [];
                }
            } catch (e) {
                console.error('Error parsing localStorage:', e);
                this.lessons = [];
            }
        }
    }

    async saveToStorage() {
        try {
            if (supabaseClient) {
                // Sync to Supabase
                localStorage.setItem('lastSaved', new Date().toISOString());
                updateStats();
                showToast('Lessen opgeslagen!', 'success');
            } else {
                // Fallback to localStorage
                localStorage.setItem('bjjLessons', JSON.stringify(this.lessons));
                localStorage.setItem('lastSaved', new Date().toISOString());
                updateStats();
                showToast('Lessen opgeslagen!', 'success');
            }
        } catch (e) {
            console.error('Error saving lessons:', e);
            showToast('Fout bij opslaan van lessen', 'error');
        }
    }

    async addLesson(lesson) {
        try {
            if (supabaseClient) {
                // Save to Supabase
                const { data, error } = await supabaseClient
                    .from('lessons')
                    .insert({
                        name: lesson.name || '',
                        description: lesson.description || '',
                        duration: lesson.duration ? parseInt(lesson.duration) : null,
                        level: lesson.level || '',
                        notes: lesson.notes || '',
                        game_ids: lesson.gameIds || []
                    })
                    .select()
                    .single();
                
                if (error) {
                    throw error;
                }
                
                // Convert to app format
                const newLesson = {
                    id: data.id,
                    name: data.name || '',
                    description: data.description || '',
                    duration: data.duration ? data.duration.toString() : '',
                    level: data.level || '',
                    notes: data.notes || '',
                    gameIds: data.game_ids || [],
                    createdAt: data.created_at,
                    updatedAt: data.updated_at
                };
                
                this.lessons.unshift(newLesson);
                await this.saveToStorage();
                renderLessons();
            } else {
                // Fallback to localStorage
                lesson.id = Date.now().toString(36) + Math.random().toString(36).substring(2);
                lesson.createdAt = new Date().toISOString();
                lesson.updatedAt = new Date().toISOString();
                this.lessons.unshift(lesson);
                await this.saveToStorage();
                renderLessons();
            }
        } catch (e) {
            console.error('Error adding lesson:', e);
            showToast('Fout bij toevoegen van les', 'error');
        }
    }

    async updateLesson(id, updates) {
        try {
            if (supabaseClient) {
                // Update in Supabase
                const { data, error } = await supabaseClient
                    .from('lessons')
                    .update({
                        name: updates.name || '',
                        description: updates.description || '',
                        duration: updates.duration ? parseInt(updates.duration) : null,
                        level: updates.level || '',
                        notes: updates.notes || '',
                        game_ids: updates.gameIds || []
                    })
                    .eq('id', id)
                    .select()
                    .single();
                
                if (error) {
                    throw error;
                }
                
                // Update local array
                const index = this.lessons.findIndex(l => l.id === id);
                if (index !== -1) {
                    this.lessons[index] = {
                        id: data.id,
                        name: data.name || '',
                        description: data.description || '',
                        duration: data.duration ? data.duration.toString() : '',
                        level: data.level || '',
                        notes: data.notes || '',
                        gameIds: data.game_ids || [],
                        createdAt: data.created_at,
                        updatedAt: data.updated_at
                    };
                    await this.saveToStorage();
                    renderLessons();
                }
            } else {
                // Fallback to localStorage
                const index = this.lessons.findIndex(l => l.id === id);
                if (index !== -1) {
                    this.lessons[index] = {
                        ...this.lessons[index],
                        ...updates,
                        updatedAt: new Date().toISOString()
                    };
                    await this.saveToStorage();
                    renderLessons();
                }
            }
        } catch (e) {
            console.error('Error updating lesson:', e);
            showToast('Fout bij bijwerken van les', 'error');
        }
    }

    async deleteLesson(id) {
        try {
            if (supabaseClient) {
                // Delete from Supabase
                const { error } = await supabaseClient
                    .from('lessons')
                    .delete()
                    .eq('id', id);
                
                if (error) {
                    throw error;
                }
                
                // Remove from local array
                const index = this.lessons.findIndex(l => l.id === id);
                if (index !== -1) {
                    this.deletedLesson = this.lessons[index];
                    this.lessons.splice(index, 1);
                    await this.saveToStorage();
                    renderLessons();
                    showToast('Les verwijderd. Klik om ongedaan te maken.', 'error', true);
                }
            } else {
                // Fallback to localStorage
                const index = this.lessons.findIndex(l => l.id === id);
                if (index !== -1) {
                    this.deletedLesson = this.lessons[index];
                    this.lessons.splice(index, 1);
                    await this.saveToStorage();
                    renderLessons();
                    showToast('Les verwijderd. Klik om ongedaan te maken.', 'error', true);
                }
            }
        } catch (e) {
            console.error('Error deleting lesson:', e);
            showToast('Fout bij verwijderen van les', 'error');
        }
    }

    async undoDelete() {
        if (this.deletedLesson) {
            await this.addLesson(this.deletedLesson);
            this.deletedLesson = null;
            showToast('Verwijdering ongedaan gemaakt', 'success');
        }
    }

    getFilteredLessons(searchTerm = '') {
        if (!searchTerm) return this.lessons;
        
        const term = searchTerm.toLowerCase();
        return this.lessons.filter(lesson => {
            return (
                (lesson.name || '').toLowerCase().includes(term) ||
                (lesson.description || '').toLowerCase().includes(term) ||
                (lesson.level || '').toLowerCase().includes(term) ||
                (lesson.notes || '').toLowerCase().includes(term)
            );
        });
    }

    exportToJSON() {
        try {
            const dataStr = JSON.stringify(this.lessons, null, 2);
            const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
            const exportFileDefaultName = `bjj-lessen-${new Date().toISOString().split('T')[0]}.json`;
            
            const linkElement = document.createElement('a');
            linkElement.setAttribute('href', dataUri);
            linkElement.setAttribute('download', exportFileDefaultName);
            linkElement.click();
            
            showToast(`${this.lessons.length} lessen geëxporteerd`, 'success');
        } catch (e) {
            console.error('Export error:', e);
            showToast('Fout bij exporteren', 'error');
        }
    }

    async importFromJSON(file) {
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const imported = JSON.parse(e.target.result);
                if (Array.isArray(imported)) {
                    const confirmed = await showConfirm(
                        `Dit vervangt je huidige ${this.lessons.length} lessen met ${imported.length} geïmporteerde lessen. Doorgaan?`,
                        'Lessen importeren'
                    );
                    if (confirmed) {
                        this.lessons = imported;
                        this.saveToStorage();
                        renderLessons();
                        showToast(`${imported.length} lessen geïmporteerd`, 'success');
                    }
                } else {
                    throw new Error('Invalid format');
                }
            } catch (error) {
                console.error('Import error:', error);
                showToast('Fout bij importeren: ongeldig bestand', 'error');
            }
        };
        reader.onerror = () => {
            showToast('Fout bij lezen van bestand', 'error');
        };
        reader.readAsText(file);
    }
}

// Initialize managers (will be initialized after Supabase client is ready)
let gameManager = null;
let lessonManager = null;

// Global state
let bulkSelectMode = false;
let selectedGameIds = new Set();
let confirmResolve = null;

// Tab switching with proper error handling
function switchTab(tab, eventElement = null) {
    try {
        // Update nav tabs
        document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
        
        if (eventElement) {
            eventElement.classList.add('active');
        } else {
            // Find button by tab name
            const buttons = document.querySelectorAll('.nav-tab');
            buttons.forEach(btn => {
                if (btn.textContent.includes(tab === 'games' ? 'Games' : tab === 'lessons' ? 'Lessen' : 'Samenstellen')) {
                    btn.classList.add('active');
                }
            });
        }

        // Update pages
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        
        switch(tab) {
            case 'games':
                document.getElementById('gamesPage').classList.add('active');
                renderGames();
                break;
            case 'lessons':
                document.getElementById('lessonsPage').classList.add('active');
                renderLessons();
                break;
            case 'compose':
                document.getElementById('composePage').classList.add('active');
                renderAvailableGames();
                break;
            default:
                console.error('Unknown tab:', tab);
        }
    } catch (e) {
        console.error('Error switching tab:', e);
        showToast('Fout bij wisselen van tab', 'error');
    }
}

// Render functions with safe rendering
function renderGames() {
    const container = document.getElementById('gamesContainer');
    if (!container) return;
    
    const searchTerm = document.getElementById('gameSearchInput')?.value || '';
    const filterPosition = document.getElementById('gameFilterSelect')?.value || '';
    const sortBy = document.getElementById('gameSortSelect')?.value || 'newest';
    const filtered = gameManager.getFilteredGames(searchTerm, filterPosition, sortBy);
    
    // Update filter dropdown
    updatePositionFilter();
    
    if (filtered.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <h2>${searchTerm || filterPosition ? 'Geen resultaten' : 'Geen games'}</h2>
                <p>${searchTerm || filterPosition ? 'Probeer andere filters' : 'Klik op "Nieuwe Game" om te beginnen'}</p>
            </div>
        `;
        return;
    }

    container.innerHTML = filtered.map(game => {
        const safeId = escapeHtml(game.id);
        const safeName = highlightSearch(game.name || '', searchTerm);
        const safePosition = highlightSearch(game.position || 'Geen positie', searchTerm);
        const safeInvariant = highlightSearch(game.invariant || 'Geen invariant opgegeven', searchTerm);
        const isSelected = selectedGameIds.has(game.id);
        const checkboxHtml = bulkSelectMode ? `
            <input type="checkbox" class="game-card-checkbox" ${isSelected ? 'checked' : ''}
                   onchange="toggleGameSelection('${safeId}')" aria-label="Selecteer game">
        ` : '';

        const clickHandler = bulkSelectMode
            ? `onclick="toggleGameSelection('${safeId}')"`
            : `onclick="editGame('${safeId}')"`;

        const cardClass = `game-card ${bulkSelectMode ? 'checkbox-mode' : ''} ${isSelected ? 'selected' : ''}`;

        // Show name as title if available, otherwise use position
        const displayTitle = game.name ? safeName : safePosition;
        const displaySubtitle = game.name ? `<div class="game-subtitle">${safePosition}</div>` : '';

        return `
            <div class="${cardClass}" ${clickHandler} role="button" tabindex="0" aria-label="${bulkSelectMode ? 'Selecteer' : 'Bewerk'} game: ${escapeHtml(game.name || game.position || 'Geen positie')}">
                ${checkboxHtml}
                <div class="game-position">${displayTitle}</div>
                ${displaySubtitle}
                <div class="game-preview">${safeInvariant}</div>
            </div>
        `;
    }).join('');
    
    updateBulkActions();
}

function updatePositionFilter() {
    const filterSelect = document.getElementById('gameFilterSelect');
    if (!filterSelect) return;
    
    const positions = gameManager.getUniquePositions();
    const currentValue = filterSelect.value;
    
    // Keep "Alle posities" option
    filterSelect.innerHTML = '<option value="">Alle posities</option>';
    
    positions.forEach(position => {
        const option = document.createElement('option');
        option.value = position;
        option.textContent = position;
        if (position === currentValue) {
            option.selected = true;
        }
        filterSelect.appendChild(option);
    });
}

function renderLessons() {
    const container = document.getElementById('lessonsContainer');
    if (!container) return;
    
    const searchTerm = document.getElementById('lessonSearchInput')?.value || '';
    const filtered = lessonManager.getFilteredLessons(searchTerm);
    
    if (filtered.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <h2>${searchTerm ? 'Geen resultaten' : 'Geen lessen'}</h2>
                <p>${searchTerm ? 'Probeer een andere zoekterm' : 'Klik op "Les Samenstellen" om een les te maken'}</p>
            </div>
        `;
        return;
    }

    container.innerHTML = filtered.map(lesson => {
        const safeId = escapeHtml(lesson.id);
        const safeName = highlightSearch(lesson.name || 'Naamloze les', searchTerm);
        const safeDescription = highlightSearch(lesson.description || 'Geen beschrijving', searchTerm);
        const gameCount = lesson.gameIds ? lesson.gameIds.length : 0;
        const duration = lesson.duration || '?';
        const level = lesson.level || 'Alle niveaus';
        return `
            <div class="lesson-card" onclick="viewLesson('${safeId}')" role="button" tabindex="0" aria-label="Bekijk les: ${escapeHtml(lesson.name || 'Naamloze les')}">
                <div class="lesson-title">${safeName}</div>
                <div class="lesson-preview">${safeDescription}</div>
                <div class="lesson-meta">
                    <span>📚 ${gameCount} games</span>
                    <span>⏱️ ${duration} min</span>
                    <span>🎯 ${escapeHtml(level)}</span>
                </div>
            </div>
        `;
    }).join('');
}

function renderAvailableGames() {
    const container = document.getElementById('availableGamesList');
    if (!container) return;
    
    const searchTerm = document.getElementById('composeSearchInput')?.value || '';
    const filtered = gameManager.getFilteredGames(searchTerm);
    
    if (filtered.length === 0) {
        container.innerHTML = `
            <div class="empty-state" style="padding: 20px;">
                <p>Geen games gevonden</p>
            </div>
        `;
        return;
    }

    container.innerHTML = filtered.map(game => {
        const safeId = escapeHtml(game.id);
        const safePosition = escapeHtml(game.position || 'Geen positie');
        const safeInvariant = escapeHtml(game.invariant || '');
        const preview = safeInvariant.length > 50 ? safeInvariant.substring(0, 50) + '...' : safeInvariant;
        const isSelected = lessonManager.selectedGames.includes(game.id);
        return `
            <div class="compose-game ${isSelected ? 'selected' : ''}" 
                 onclick="toggleGameSelection('${safeId}')" 
                 role="button" 
                 tabindex="0"
                 aria-label="${isSelected ? 'Deselecteer' : 'Selecteer'} game: ${safePosition}"
                 aria-pressed="${isSelected}">
                <div>
                    <strong>${safePosition}</strong>
                    <div style="font-size: 0.85rem; color: #7f8c8d; margin-top: 5px;">
                        ${preview}
                    </div>
                </div>
                <div class="checkbox-container">
                    <input type="checkbox" ${isSelected ? 'checked' : ''} aria-label="Selectie checkbox">
                </div>
            </div>
        `;
    }).join('');
}

function renderSelectedGames() {
    const container = document.getElementById('selectedGamesList');
    if (!container) return;
    
    if (lessonManager.selectedGames.length === 0) {
        container.innerHTML = `
            <div class="empty-state" style="padding: 20px;">
                <p>Selecteer games uit de linker lijst</p>
            </div>
        `;
        return;
    }

    container.innerHTML = lessonManager.selectedGames.map((gameId, index) => {
        const game = gameManager.games.find(g => g.id === gameId);
        if (!game) return '';
        
        const safeId = escapeHtml(game.id);
        const safePosition = escapeHtml(game.position || 'Geen positie');
        const safeInvariant = escapeHtml(game.invariant || '');
        const preview = safeInvariant.length > 50 ? safeInvariant.substring(0, 50) + '...' : safeInvariant;
        
        return `
            <div class="sortable-item" draggable="true" data-game-id="${safeId}" role="listitem" aria-label="Game ${index + 1}: ${safePosition}">
                <div style="display: flex; align-items: center;">
                    <span class="order-number">${index + 1}</span>
                    <div>
                        <strong>${safePosition}</strong>
                        <div style="font-size: 0.85rem; color: #7f8c8d;">
                            ${preview}
                        </div>
                    </div>
                </div>
                <button class="remove-btn" onclick="removeGameFromLesson('${safeId}')" aria-label="Verwijder game">Verwijder</button>
            </div>
        `;
    }).join('');

    // Add drag and drop functionality
    initDragAndDrop();
}

let draggedElement = null;

function initDragAndDrop() {
    const sortableList = document.getElementById('selectedGamesList');
    if (!sortableList) return;
    
    const items = sortableList.querySelectorAll('.sortable-item');
    
    items.forEach(item => {
        item.addEventListener('dragstart', handleDragStart);
        item.addEventListener('dragover', handleDragOver);
        item.addEventListener('drop', handleDrop);
        item.addEventListener('dragenter', handleDragEnter);
        item.addEventListener('dragleave', handleDragLeave);
        item.addEventListener('dragend', handleDragEnd);
    });
}

function handleDragStart(e) {
    draggedElement = this;
    this.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/html', this.innerHTML);
}

function handleDragOver(e) {
    if (e.preventDefault) {
        e.preventDefault();
    }
    e.dataTransfer.dropEffect = 'move';
    return false;
}

function handleDragEnter(e) {
    this.classList.add('over');
}

function handleDragLeave(e) {
    this.classList.remove('over');
}

function handleDrop(e) {
    if (e.stopPropagation) {
        e.stopPropagation();
    }

    if (draggedElement !== this) {
        const draggedId = draggedElement.dataset.gameId;
        const targetId = this.dataset.gameId;
        
        const draggedIndex = lessonManager.selectedGames.indexOf(draggedId);
        const targetIndex = lessonManager.selectedGames.indexOf(targetId);
        
        if (draggedIndex !== -1 && targetIndex !== -1) {
            lessonManager.selectedGames.splice(draggedIndex, 1);
            lessonManager.selectedGames.splice(targetIndex, 0, draggedId);
            renderSelectedGames();
        }
    }

    return false;
}

function handleDragEnd(e) {
    const items = document.querySelectorAll('.sortable-item');
    items.forEach(item => {
        item.classList.remove('over');
        item.classList.remove('dragging');
    });
}

// Game management functions
function openNewGameModal() {
    gameManager.currentEditId = null;
    document.getElementById('modalTitle').textContent = 'Nieuwe Game';
    document.getElementById('modalName').value = '';
    document.getElementById('modalPosition').value = '';
    document.getElementById('modalInvariant').value = '';
    document.getElementById('modalTaskA').value = '';
    document.getElementById('modalTaskB').value = '';
    document.getElementById('modalDifferentiation').value = '';
    document.getElementById('deleteBtn').style.display = 'none';
    document.getElementById('gameModal').classList.add('active');
    
    // Set ARIA attributes
    document.getElementById('gameModal').setAttribute('aria-hidden', 'false');
    document.getElementById('gameModal').setAttribute('role', 'dialog');
    document.getElementById('gameModal').setAttribute('aria-labelledby', 'modalTitle');
    
    document.getElementById('modalPosition').focus();
}

function editGame(id) {
    const game = gameManager.games.find(g => g.id === id);
    if (!game) {
        showToast('Game niet gevonden', 'error');
        return;
    }
    
    gameManager.currentEditId = id;
    document.getElementById('modalTitle').textContent = 'Game Bewerken';
    document.getElementById('modalName').value = game.name || '';
    document.getElementById('modalPosition').value = game.position || '';
    document.getElementById('modalInvariant').value = game.invariant || '';
    document.getElementById('modalTaskA').value = game.taskPlayerA || '';
    document.getElementById('modalTaskB').value = game.taskPlayerB || '';
    document.getElementById('modalDifferentiation').value = game.differentiation || '';
    document.getElementById('deleteBtn').style.display = 'inline-flex';
    document.getElementById('gameModal').classList.add('active');
    
    // Set ARIA attributes
    document.getElementById('gameModal').setAttribute('aria-hidden', 'false');
    document.getElementById('gameModal').setAttribute('role', 'dialog');
    document.getElementById('gameModal').setAttribute('aria-labelledby', 'modalTitle');
    
    document.getElementById('modalPosition').focus();
}

function validateGame(game) {
    if (!game.position || game.position.trim().length === 0) {
        return { valid: false, message: 'Positie is verplicht' };
    }
    
    if (game.position.length > CONSTANTS.MAX_TEXT_LENGTH) {
        return { valid: false, message: `Positie mag maximaal ${CONSTANTS.MAX_TEXT_LENGTH} tekens bevatten` };
    }
    
    return { valid: true };
}

async function saveGame() {
    const game = {
        name: sanitizeInput(document.getElementById('modalName').value),
        position: sanitizeInput(document.getElementById('modalPosition').value),
        invariant: sanitizeInput(document.getElementById('modalInvariant').value),
        taskPlayerA: sanitizeInput(document.getElementById('modalTaskA').value),
        taskPlayerB: sanitizeInput(document.getElementById('modalTaskB').value),
        differentiation: sanitizeInput(document.getElementById('modalDifferentiation').value)
    };

    const validation = validateGame(game);
    if (!validation.valid) {
        showToast(validation.message, 'error');
        return;
    }

    try {
        if (gameManager.currentEditId) {
            await gameManager.updateGame(gameManager.currentEditId, game);
            showToast('Game bijgewerkt!', 'success');
        } else {
            await gameManager.addGame(game);
            // addGame toont al een success message
        }
        closeModal('gameModal');
    } catch (e) {
        console.error('Fout bij opslaan game:', e);
        // Error message wordt al getoond door addGame/updateGame
    }
}

async function deleteGame() {
    if (gameManager.currentEditId) {
        const confirmed = await showConfirm(
            'Weet je zeker dat je deze game wilt verwijderen?',
            'Game verwijderen'
        );
        if (confirmed) {
            await gameManager.deleteGame(gameManager.currentEditId);
            closeModal('gameModal');
        }
    }
}

// Lesson management functions

function removeGameFromLesson(gameId) {
    const index = lessonManager.selectedGames.indexOf(gameId);
    if (index !== -1) {
        lessonManager.selectedGames.splice(index, 1);
        renderAvailableGames();
        renderSelectedGames();
    }
}

function validateLesson(lesson) {
    if (!lesson.name || lesson.name.trim().length === 0) {
        return { valid: false, message: 'Les naam is verplicht' };
    }
    
    if (lesson.name.length > CONSTANTS.MAX_TEXT_LENGTH) {
        return { valid: false, message: `Les naam mag maximaal ${CONSTANTS.MAX_TEXT_LENGTH} tekens bevatten` };
    }
    
    if (lesson.gameIds.length === 0) {
        return { valid: false, message: 'Selecteer minimaal één game' };
    }
    
    const duration = parseInt(lesson.duration);
    if (lesson.duration && (isNaN(duration) || duration < CONSTANTS.MIN_DURATION || duration > CONSTANTS.MAX_DURATION)) {
        return { valid: false, message: `Duur moet tussen ${CONSTANTS.MIN_DURATION} en ${CONSTANTS.MAX_DURATION} minuten zijn` };
    }
    
    return { valid: true };
}

async function saveLesson() {
    const durationValue = document.getElementById('lessonDuration').value.trim();
    const duration = durationValue ? parseInt(durationValue) : null;
    
    const lesson = {
        name: sanitizeInput(document.getElementById('lessonName').value),
        description: sanitizeInput(document.getElementById('lessonDescription').value),
        duration: duration ? duration.toString() : '',
        level: sanitizeInput(document.getElementById('lessonLevel').value),
        notes: sanitizeInput(document.getElementById('lessonNotes').value),
        gameIds: [...lessonManager.selectedGames]
    };

    const validation = validateLesson(lesson);
    if (!validation.valid) {
        showToast(validation.message, 'error');
        return;
    }

    if (lessonManager.currentEditId) {
        await lessonManager.updateLesson(lessonManager.currentEditId, lesson);
    } else {
        await lessonManager.addLesson(lesson);
    }

    clearLesson();
    switchTab('lessons');
    showToast('Les opgeslagen!', 'success');
}

function clearLesson() {
    document.getElementById('lessonName').value = '';
    document.getElementById('lessonDescription').value = '';
    document.getElementById('lessonDuration').value = '60';
    document.getElementById('lessonLevel').value = '';
    document.getElementById('lessonNotes').value = '';
    lessonManager.selectedGames = [];
    lessonManager.currentEditId = null;
    renderAvailableGames();
    renderSelectedGames();
}

function viewLesson(id) {
    const lesson = lessonManager.lessons.find(l => l.id === id);
    if (!lesson) {
        showToast('Les niet gevonden', 'error');
        return;
    }

    lessonManager.currentViewId = id;
    document.getElementById('lessonModalTitle').textContent = lesson.name || 'Naamloze les';
    
    const safeDescription = escapeHtml(lesson.description || 'Geen beschrijving');
    const safeLevel = escapeHtml(lesson.level || 'Alle niveaus');
    const safeDuration = escapeHtml(lesson.duration || '?');
    const safeNotes = escapeHtml(lesson.notes || '');
    
    let content = `
        <div class="game-field">
            <label>Beschrijving</label>
            <p>${safeDescription}</p>
        </div>
        <div class="game-field">
            <label>Niveau</label>
            <p>${safeLevel}</p>
        </div>
        <div class="game-field">
            <label>Duur</label>
            <p>${safeDuration} minuten</p>
        </div>
        ${lesson.notes ? `
        <div class="game-field">
            <label>Notities</label>
            <p>${safeNotes}</p>
        </div>
        ` : ''}
        <div class="game-field">
            <label>Games (${lesson.gameIds ? lesson.gameIds.length : 0})</label>
            <div style="margin-top: 10px;">
    `;

    if (lesson.gameIds && lesson.gameIds.length > 0) {
        lesson.gameIds.forEach((gameId, index) => {
            const game = gameManager.games.find(g => g.id === gameId);
            if (game) {
                const safePosition = escapeHtml(game.position || 'Geen positie');
                const safeInvariant = escapeHtml(game.invariant || '');
                const safeTaskA = escapeHtml(game.taskPlayerA || '');
                const safeTaskB = escapeHtml(game.taskPlayerB || '');
                const safeDiff = escapeHtml(game.differentiation || '');
                
                content += `
                    <div style="border: 1px solid var(--border); border-radius: 8px; padding: 15px; margin-bottom: 15px;">
                        <div style="display: flex; align-items: center; margin-bottom: 10px;">
                            <span class="order-number">${index + 1}</span>
                            <strong style="color: var(--primary);">${safePosition}</strong>
                        </div>
                        ${game.invariant ? `<p style="margin-bottom: 8px;"><strong>Invariant:</strong> ${safeInvariant}</p>` : ''}
                        ${game.taskPlayerA ? `<p style="margin-bottom: 8px;"><strong>Speler A:</strong> ${safeTaskA}</p>` : ''}
                        ${game.taskPlayerB ? `<p style="margin-bottom: 8px;"><strong>Speler B:</strong> ${safeTaskB}</p>` : ''}
                        ${game.differentiation ? `<p><strong>Differentiatie:</strong> ${safeDiff}</p>` : ''}
                    </div>
                `;
            }
        });
    } else {
        content += '<p>Geen games in deze les</p>';
    }

    content += `
            </div>
        </div>
    `;

    document.getElementById('lessonModalBody').innerHTML = content;
    document.getElementById('lessonModal').classList.add('active');
    
    // Set ARIA attributes
    document.getElementById('lessonModal').setAttribute('aria-hidden', 'false');
    document.getElementById('lessonModal').setAttribute('role', 'dialog');
    document.getElementById('lessonModal').setAttribute('aria-labelledby', 'lessonModalTitle');
}

function editLesson() {
    const lesson = lessonManager.lessons.find(l => l.id === lessonManager.currentViewId);
    if (!lesson) {
        showToast('Les niet gevonden', 'error');
        return;
    }

    lessonManager.currentEditId = lesson.id;
    document.getElementById('lessonName').value = lesson.name || '';
    document.getElementById('lessonDescription').value = lesson.description || '';
    document.getElementById('lessonDuration').value = lesson.duration || '60';
    document.getElementById('lessonLevel').value = lesson.level || '';
    document.getElementById('lessonNotes').value = lesson.notes || '';
    lessonManager.selectedGames = lesson.gameIds ? [...lesson.gameIds] : [];
    
    closeModal('lessonModal');
    switchTab('compose');
    renderAvailableGames();
    renderSelectedGames();
}

async function deleteLesson() {
    if (lessonManager.currentViewId) {
        const confirmed = await showConfirm(
            'Weet je zeker dat je deze les wilt verwijderen?',
            'Les verwijderen'
        );
        if (confirmed) {
            await lessonManager.deleteLesson(lessonManager.currentViewId);
            closeModal('lessonModal');
        }
    }
}

function printLesson() {
    const lesson = lessonManager.lessons.find(l => l.id === lessonManager.currentViewId);
    if (!lesson) {
        showToast('Les niet gevonden', 'error');
        return;
    }

    const safeName = escapeHtml(lesson.name || 'Naamloze les');
    const safeLevel = escapeHtml(lesson.level || 'Alle niveaus');
    const safeDuration = escapeHtml(lesson.duration || '?');
    const safeDescription = escapeHtml(lesson.description || '');
    const safeNotes = escapeHtml(lesson.notes || '');
    
    let printContent = `
        <h1>${safeName}</h1>
        <p><strong>Niveau:</strong> ${safeLevel} | <strong>Duur:</strong> ${safeDuration} minuten</p>
        ${lesson.description ? `<p><strong>Beschrijving:</strong> ${safeDescription}</p>` : ''}
        ${lesson.notes ? `<p><strong>Notities:</strong> ${safeNotes}</p>` : ''}
        <hr style="margin: 20px 0;">
    `;

    if (lesson.gameIds && lesson.gameIds.length > 0) {
        lesson.gameIds.forEach((gameId, index) => {
            const game = gameManager.games.find(g => g.id === gameId);
            if (game) {
                const safePosition = escapeHtml(game.position || 'Geen positie');
                const safeInvariant = escapeHtml(game.invariant || '');
                const safeTaskA = escapeHtml(game.taskPlayerA || '');
                const safeTaskB = escapeHtml(game.taskPlayerB || '');
                const safeDiff = escapeHtml(game.differentiation || '');
                
                printContent += `
                    <div class="print-game">
                        <h3>Game ${index + 1}: ${safePosition}</h3>
                        ${game.invariant ? `<div class="print-field"><strong>Invariant:</strong> ${safeInvariant}</div>` : ''}
                        ${game.taskPlayerA ? `<div class="print-field"><strong>Opdracht Speler A:</strong> ${safeTaskA}</div>` : ''}
                        ${game.taskPlayerB ? `<div class="print-field"><strong>Opdracht Speler B:</strong> ${safeTaskB}</div>` : ''}
                        ${game.differentiation ? `<div class="print-field"><strong>Differentiatie:</strong> ${safeDiff}</div>` : ''}
                    </div>
                `;
            }
        });
    }

    document.getElementById('lessonPrintView').innerHTML = printContent;
    window.print();
}

// Custom confirm dialog
function showConfirm(message, title = 'Bevestig actie') {
    return new Promise((resolve) => {
        const modal = document.getElementById('confirmModal');
        const titleEl = document.getElementById('confirmModalTitle');
        const messageEl = document.getElementById('confirmMessage');
        const okBtn = document.getElementById('confirmOkBtn');
        
        if (!modal || !titleEl || !messageEl || !okBtn) {
            resolve(window.confirm(message));
            return;
        }
        
        titleEl.textContent = title;
        messageEl.textContent = message;
        
        // Remove old event listeners
        const newOkBtn = okBtn.cloneNode(true);
        okBtn.parentNode.replaceChild(newOkBtn, okBtn);
        
        newOkBtn.onclick = () => {
            closeModal('confirmModal');
            resolve(true);
        };
        
        document.getElementById('confirmCancelBtn').onclick = () => {
            closeModal('confirmModal');
            resolve(false);
        };
        
        modal.classList.add('active');
        modal.setAttribute('aria-hidden', 'false');
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-labelledby', 'confirmModalTitle');
    });
}

// Theme management
function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    
    const themeToggle = document.querySelector('.theme-toggle');
    if (themeToggle) {
        themeToggle.textContent = newTheme === 'dark' ? '☀️' : '🌙';
    }
}

function loadTheme() {
    const savedTheme = localStorage.getItem('theme') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme', savedTheme);
    const themeToggle = document.querySelector('.theme-toggle');
    if (themeToggle) {
        themeToggle.textContent = savedTheme === 'dark' ? '☀️' : '🌙';
    }
}

// Bulk select functionality
function toggleBulkSelect() {
    bulkSelectMode = !bulkSelectMode;
    selectedGameIds.clear();
    
    const btn = document.getElementById('bulkSelectBtn');
    if (btn) {
        btn.textContent = bulkSelectMode ? '❌ Annuleer' : '☑️ Selecteren';
    }
    
    const bulkActions = document.getElementById('bulkActions');
    if (bulkActions) {
        bulkActions.classList.toggle('active', bulkSelectMode);
    }
    
    renderGames();
}

function toggleGameSelection(gameId) {
    if (!bulkSelectMode) {
        // Original behavior - toggle game selection in compose mode
        const index = lessonManager.selectedGames.indexOf(gameId);
        if (index === -1) {
            lessonManager.selectedGames.push(gameId);
        } else {
            lessonManager.selectedGames.splice(index, 1);
        }
        renderAvailableGames();
        renderSelectedGames();
        return;
    }
    
    // Bulk select mode
    if (selectedGameIds.has(gameId)) {
        selectedGameIds.delete(gameId);
    } else {
        selectedGameIds.add(gameId);
    }
    renderGames();
    updateBulkActions();
}

function updateBulkActions() {
    const bulkActions = document.getElementById('bulkActions');
    const bulkCount = document.getElementById('bulkCount');
    
    if (bulkActions && bulkCount) {
        const count = selectedGameIds.size;
        bulkCount.textContent = count;
        bulkActions.classList.toggle('active', count > 0);
    }
}

async function bulkDeleteGames() {
    if (selectedGameIds.size === 0) return;
    
    const count = selectedGameIds.size;
    const confirmed = await showConfirm(
        `Weet je zeker dat je ${count} game(s) wilt verwijderen?`,
        'Games verwijderen'
    );
    
    if (confirmed) {
        for (const id of selectedGameIds) {
            await gameManager.deleteGame(id);
        }
        selectedGameIds.clear();
        toggleBulkSelect();
        showToast(`${count} games verwijderd`, 'success');
    }
}

// Dashboard functionality
function showDashboard() {
    const modal = document.getElementById('dashboardModal');
    const body = document.getElementById('dashboardBody');
    
    if (!modal || !body) return;
    
    const totalGames = gameManager.games.length;
    const totalLessons = lessonManager.lessons.length;
    const totalGamesInLessons = lessonManager.lessons.reduce((sum, lesson) => {
        return sum + (lesson.gameIds ? lesson.gameIds.length : 0);
    }, 0);
    
    const avgGamesPerLesson = totalLessons > 0 ? (totalGamesInLessons / totalLessons).toFixed(1) : 0;
    
    const avgDuration = lessonManager.lessons.reduce((sum, lesson) => {
        return sum + (parseInt(lesson.duration) || 0);
    }, 0) / (totalLessons || 1);
    
    const positions = gameManager.getUniquePositions();
    const mostUsedPosition = getMostUsedPosition();
    
    body.innerHTML = `
        <div class="dashboard">
            <div class="dashboard-card">
                <h3>${totalGames}</h3>
                <p>Totale Games</p>
            </div>
            <div class="dashboard-card">
                <h3>${totalLessons}</h3>
                <p>Totale Lessen</p>
            </div>
            <div class="dashboard-card">
                <h3>${avgGamesPerLesson}</h3>
                <p>Gem. Games per Les</p>
            </div>
            <div class="dashboard-card">
                <h3>${Math.round(avgDuration)}</h3>
                <p>Gem. Lesduur (min)</p>
            </div>
            <div class="dashboard-card">
                <h3>${positions.length}</h3>
                <p>Unieke Posities</p>
            </div>
            <div class="dashboard-card">
                <h3>${mostUsedPosition || 'N/A'}</h3>
                <p>Meest Gebruikte Positie</p>
            </div>
        </div>
        <div style="margin-top: 20px;">
            <h3 style="margin-bottom: 10px; color: var(--primary);">Posities Overzicht</h3>
            <div style="display: flex; flex-wrap: wrap; gap: 10px;">
                ${positions.map(pos => {
                    const count = gameManager.games.filter(g => g.position === pos).length;
                    return `<span style="background: var(--bg-secondary); padding: 8px 12px; border-radius: 8px; border: 1px solid var(--border);">
                        ${escapeHtml(pos)} (${count})
                    </span>`;
                }).join('')}
            </div>
        </div>
    `;
    
    modal.classList.add('active');
    modal.setAttribute('aria-hidden', 'false');
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-labelledby', 'dashboardModalTitle');
}

function getMostUsedPosition() {
    const positionCounts = {};
    gameManager.games.forEach(game => {
        const pos = game.position || 'Geen positie';
        positionCounts[pos] = (positionCounts[pos] || 0) + 1;
    });
    
    let maxCount = 0;
    let mostUsed = null;
    Object.entries(positionCounts).forEach(([pos, count]) => {
        if (count > maxCount) {
            maxCount = count;
            mostUsed = pos;
        }
    });
    
    return mostUsed;
}

// Utility functions
function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    
    modal.classList.remove('active');
    modal.setAttribute('aria-hidden', 'true');
    
    if (modalId === 'gameModal') {
        gameManager.currentEditId = null;
    } else if (modalId === 'lessonModal') {
        lessonManager.currentViewId = null;
    } else if (modalId === 'confirmModal') {
        if (confirmResolve) {
            confirmResolve(false);
            confirmResolve = null;
        }
    }
}

function showToast(message, type = 'success', canUndo = false) {
    const toast = document.getElementById('toast');
    if (!toast) return;
    
    toast.textContent = message;
    toast.className = `toast show ${type}`;
    toast.setAttribute('role', 'alert');
    
    if (canUndo) {
        toast.style.cursor = 'pointer';
        const undoHandler = () => {
            if (type === 'error') {
                // Determine which manager to use based on context
                if (gameManager.deletedGame) {
                    gameManager.undoDelete();
                } else if (lessonManager.deletedLesson) {
                    lessonManager.undoDelete();
                }
            }
            toast.onclick = null;
            toast.style.cursor = '';
        };
        toast.onclick = undoHandler;
        
        const currentTimeout = type === 'error' 
            ? (gameManager.deletedGame ? gameManager.undoTimeout : lessonManager.undoTimeout)
            : null;
        
        if (currentTimeout) {
            clearTimeout(currentTimeout);
        }
        
        const timeout = setTimeout(() => {
            if (type === 'error') {
                if (gameManager.deletedGame) {
                    gameManager.deletedGame = null;
                } else if (lessonManager.deletedLesson) {
                    lessonManager.deletedLesson = null;
                }
            }
            toast.onclick = null;
            toast.style.cursor = '';
        }, CONSTANTS.UNDO_TIMEOUT);
        
        if (type === 'error') {
            if (gameManager.deletedGame) {
                gameManager.undoTimeout = timeout;
            } else {
                lessonManager.undoTimeout = timeout;
            }
        }
    }
    
    setTimeout(() => {
        toast.classList.remove('show');
    }, CONSTANTS.TOAST_DURATION);
}

function updateStats() {
    const gameCountEl = document.getElementById('gameCount');
    const lessonCountEl = document.getElementById('lessonCount');
    const lastSavedEl = document.getElementById('lastSaved');
    
    if (gameCountEl) {
        gameCountEl.textContent = `${gameManager.games.length} game${gameManager.games.length !== 1 ? 's' : ''}`;
    }
    
    if (lessonCountEl) {
        lessonCountEl.textContent = `${lessonManager.lessons.length} ${lessonManager.lessons.length !== 1 ? 'lessen' : 'les'}`;
    }
    
    if (lastSavedEl) {
        const lastSaved = localStorage.getItem('lastSaved');
        if (lastSaved) {
            try {
                const date = new Date(lastSaved);
                const timeStr = date.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
                lastSavedEl.textContent = `Laatst opgeslagen: ${timeStr}`;
            } catch (e) {
                console.error('Error formatting date:', e);
            }
        }
    }
}

// Export/Import functions with loading states
function setLoadingState(isLoading) {
    const buttons = document.querySelectorAll('.btn-success');
    buttons.forEach(btn => {
        if (isLoading) {
            btn.disabled = true;
            const originalText = btn.innerHTML;
            btn.dataset.originalText = originalText;
            btn.innerHTML = '<span class="loading"></span> Laden...';
        } else {
            btn.disabled = false;
            if (btn.dataset.originalText) {
                btn.innerHTML = btn.dataset.originalText;
                delete btn.dataset.originalText;
            }
        }
    });
}

function exportAll() {
    try {
        setLoadingState(true);
        
        const allData = {
            games: gameManager.games,
            lessons: lessonManager.lessons,
            exportDate: new Date().toISOString(),
            version: "2.0"
        };
        
        const dataStr = JSON.stringify(allData, null, 2);
        const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
        const exportFileDefaultName = `bjj-complete-${new Date().toISOString().split('T')[0]}.json`;
        
        const linkElement = document.createElement('a');
        linkElement.setAttribute('href', dataUri);
        linkElement.setAttribute('download', exportFileDefaultName);
        linkElement.click();
        
        showToast(`${gameManager.games.length} games + ${lessonManager.lessons.length} lessen geëxporteerd`, 'success');
        
        setTimeout(() => setLoadingState(false), 500);
    } catch (e) {
        console.error('Export error:', e);
        showToast('Fout bij exporteren', 'error');
        setLoadingState(false);
    }
}

async function refreshData() {
    try {
        setLoadingState(true);
        showToast('Data wordt geladen uit database...', 'info');
        console.log('🔄 Laad data uit Supabase...');
        
        // Check if Supabase client is available
        if (!supabaseClient) {
            console.error('❌ Supabase client niet beschikbaar!');
            showToast('Supabase niet beschikbaar. Controleer console voor details.', 'error');
            setLoadingState(false);
            return;
        }
        
        // Check if managers are initialized
        if (!gameManager || !lessonManager) {
            console.error('❌ Managers niet geïnitialiseerd!');
            showToast('Managers niet klaar. Herlaad de pagina.', 'error');
            setLoadingState(false);
            return;
        }
        
        // Reload data from Supabase
        await Promise.all([
            gameManager.loadGames(),
            lessonManager.loadLessons()
        ]);
        
        // Refresh UI
        renderGames();
        renderLessons();
        renderAvailableGames();
        updateStats();
        updatePositionFilter();
        
        console.log(`✅ Data geladen: ${gameManager.games.length} games, ${lessonManager.lessons.length} lessen`);
        showToast(`Data geladen: ${gameManager.games.length} games, ${lessonManager.lessons.length} lessen`, 'success');
        setTimeout(() => setLoadingState(false), 500);
    } catch (e) {
        console.error('❌ Error refreshing data:', e);
        showToast(`Fout bij laden: ${e.message}`, 'error');
        setLoadingState(false);
    }
}

// Make refreshData available immediately (before DOMContentLoaded)
window.refreshData = refreshData;

async function importAll(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    setLoadingState(true);
    
    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const imported = JSON.parse(e.target.result);
            
            // Check if it's the new combined format
            if (imported.games && imported.lessons) {
                const gameCount = imported.games.length || 0;
                const lessonCount = imported.lessons.length || 0;
                const currentGameCount = gameManager.games.length;
                const currentLessonCount = lessonManager.lessons.length;
                
                const confirmed = await showConfirm(
                    `Dit vervangt je huidige data:\n` +
                    `Games: ${currentGameCount} → ${gameCount}\n` +
                    `Lessen: ${currentLessonCount} → ${lessonCount}\n\n` +
                    `Doorgaan?`,
                    'Data importeren'
                );
                
                if (confirmed) {
                    // Import games
                    if (Array.isArray(imported.games) && imported.games.length > 0) {
                        for (const game of imported.games) {
                            // Remove id and timestamps to create new entries
                            const { id, createdAt, updatedAt, ...gameData } = game;
                            await gameManager.addGame(gameData);
                        }
                    }
                    
                    // Import lessons
                    if (Array.isArray(imported.lessons) && imported.lessons.length > 0) {
                        for (const lesson of imported.lessons) {
                            // Remove id and timestamps to create new entries
                            const { id, createdAt, updatedAt, ...lessonData } = lesson;
                            await lessonManager.addLesson(lessonData);
                        }
                    }
                    
                    await gameManager.loadGames();
                    await lessonManager.loadLessons();
                    renderGames();
                    renderLessons();
                    renderAvailableGames();
                    showToast(`${gameCount} games + ${lessonCount} lessen geïmporteerd`, 'success');
                }
            }
            // Backward compatibility: if it's just an array, assume it's games only
            else if (Array.isArray(imported)) {
                const confirmed = await showConfirm(
                    `Dit lijkt een oud games-bestand. Alleen games importeren (${imported.length} games)? Lessen blijven ongewijzigd.`,
                    'Games importeren'
                );
                if (confirmed) {
                    // Import games one by one to Supabase
                    for (const game of imported) {
                        // Remove id and timestamps to create new entries
                        const { id, createdAt, updatedAt, ...gameData } = game;
                        await gameManager.addGame(gameData);
                    }
                    
                    await gameManager.loadGames();
                    renderGames();
                    renderAvailableGames();
                    showToast(`${imported.length} games geïmporteerd`, 'success');
                }
            }
            else {
                throw new Error('Invalid format');
            }
        } catch (error) {
            console.error('Import error:', error);
            showToast('Fout bij importeren: ongeldig bestand', 'error');
        } finally {
            setLoadingState(false);
            event.target.value = '';
        }
    };
    
    reader.onerror = () => {
        showToast('Fout bij lezen van bestand', 'error');
        setLoadingState(false);
        event.target.value = '';
    };
    
    reader.readAsText(file);
}

// Debounced search functions
const debouncedRenderGames = debounce(renderGames, CONSTANTS.SEARCH_DEBOUNCE);
const debouncedRenderLessons = debounce(renderLessons, CONSTANTS.SEARCH_DEBOUNCE);
const debouncedRenderAvailableGames = debounce(renderAvailableGames, CONSTANTS.SEARCH_DEBOUNCE);

// Event listeners
document.addEventListener('DOMContentLoaded', () => {
    // Search inputs
    const gameSearchInput = document.getElementById('gameSearchInput');
    const lessonSearchInput = document.getElementById('lessonSearchInput');
    const composeSearchInput = document.getElementById('composeSearchInput');
    
    if (gameSearchInput) {
        gameSearchInput.addEventListener('input', debouncedRenderGames);
    }
    
    if (lessonSearchInput) {
        lessonSearchInput.addEventListener('input', debouncedRenderLessons);
    }
    
    if (composeSearchInput) {
        composeSearchInput.addEventListener('input', debouncedRenderAvailableGames);
    }
    
    // Keyboard navigation
    document.addEventListener('keydown', (e) => {
        // Escape to close modals
        if (e.key === 'Escape') {
            document.querySelectorAll('.modal.active').forEach(modal => {
                const modalId = modal.id;
                closeModal(modalId);
            });
        }
        
        // Ctrl+S to save game modal
        if (e.ctrlKey && e.key === 's') {
            e.preventDefault();
            if (document.getElementById('gameModal').classList.contains('active')) {
                saveGame();
            } else if (document.getElementById('composePage').classList.contains('active')) {
                saveLesson();
            }
        }
        
        // Enter on cards to activate
        if (e.key === 'Enter' && e.target.classList.contains('game-card')) {
            e.target.click();
        }
        
        if (e.key === 'Enter' && e.target.classList.contains('lesson-card')) {
            e.target.click();
        }
        
        // Tab navigation in modals
        if (e.key === 'Tab') {
            const activeModal = document.querySelector('.modal.active');
            if (activeModal) {
                const focusableElements = activeModal.querySelectorAll(
                    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
                );
                const firstElement = focusableElements[0];
                const lastElement = focusableElements[focusableElements.length - 1];
                
                if (e.shiftKey && document.activeElement === firstElement) {
                    e.preventDefault();
                    lastElement.focus();
                } else if (!e.shiftKey && document.activeElement === lastElement) {
                    e.preventDefault();
                    firstElement.focus();
                }
            }
        }
    });
    
    // Auto-save visual feedback
    document.querySelectorAll('.modal-body textarea, .modal-body input').forEach(field => {
        field.addEventListener('input', () => {
            field.parentElement.classList.add('saving');
            setTimeout(() => {
                field.parentElement.classList.remove('saving');
            }, 500);
        });
    });
    
    // Initialize Supabase client
    // Wait for Supabase library to be fully loaded using event listener
    const initSupabase = async () => {
        try {
            // Wait for supabaseReady event or check if already ready
            if (!window.supabaseReady) {
                await new Promise((resolve) => {
                    if (window.supabaseReady) {
                        resolve();
                    } else {
                        window.addEventListener('supabaseReady', resolve, { once: true });
                        // Timeout after 3 seconds
                        setTimeout(resolve, 3000);
                    }
                });
            }
            
            if (typeof supabase === 'undefined' || !supabase.createClient) {
                console.warn('⚠️ Supabase library niet geladen via CDN, probeer dynamic import');
                try {
                    const module = await import('https://esm.sh/@supabase/supabase-js@2');
                    if (module && module.createClient) {
                        console.log('✅ Supabase geladen via dynamic import (esm.sh)');
                        window.supabase = {
                            createClient: module.createClient
                        };
                    }
                } catch (importError) {
                    console.error('❌ Dynamic import van Supabase mislukt:', importError);
                }
            }
            
            if (typeof supabase === 'undefined' || !supabase.createClient) {
                console.warn('⚠️ Supabase library nog steeds niet geladen');
                console.warn('Browser:', navigator.userAgent);
                console.warn('Mogelijke oorzaken:');
                console.warn('- Browserextensies blokkeren externe scripts');
                console.warn('- Network/firewall blokkeert alle Supabase CDN endpoints');
                console.warn('- Content Security Policy blokkeert externe scripts');
                supabaseClient = null;
                return;
            }
            
            if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
                console.error('❌ Supabase credentials ontbreken:', { 
                    hasUrl: !!SUPABASE_URL, 
                    hasKey: !!SUPABASE_ANON_KEY,
                    url: SUPABASE_URL,
                    keyLength: SUPABASE_ANON_KEY?.length
                });
                supabaseClient = null;
                return;
            }
            
            supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
            console.log('✅ Supabase client geïnitialiseerd', { 
                url: SUPABASE_URL.substring(0, 30) + '...',
                hasKey: !!SUPABASE_ANON_KEY,
                keyLength: SUPABASE_ANON_KEY.length,
                browser: navigator.userAgent.includes('Chrome') ? 'Chrome' : navigator.userAgent.includes('Edge') ? 'Edge' : 'Other'
            });
            
            // Test de connectie (async, niet blocking)
            (async () => {
                try {
                    const { data, error } = await supabaseClient.from('games').select('id').limit(1);
                    if (error) {
                        console.error('⚠️ Supabase connectie test mislukt:', error);
                        console.error('Dit kan betekenen dat RLS policies niet correct zijn ingesteld');
                    } else {
                        console.log('✅ Supabase connectie test geslaagd');
                    }
                } catch (e) {
                    console.error('⚠️ Fout bij connectie test:', e);
                }
            })();
        } catch (e) {
            console.error('❌ Fout bij initialiseren Supabase:', e);
            console.error('Error details:', {
                message: e.message,
                stack: e.stack,
                browser: navigator.userAgent
            });
            supabaseClient = null;
        }
    };
    
    // Start Supabase initialization and wait for it before initializing managers
    initSupabase().then(() => {
        // Initialize managers AFTER Supabase client is ready (or after timeout)
        // This ensures they can load data from Supabase if available
        gameManager = new GameManager();
        lessonManager = new LessonManager();
        
        // Wait for managers to load data, then render
        Promise.all([
            gameManager.init(),
            lessonManager.init()
        ]).then(() => {
            renderGames();
            renderLessons();
            renderAvailableGames();
            updateStats();
            updatePositionFilter();
        }).catch(err => {
            console.error('Error initializing managers:', err);
            // Still render even if there's an error
            renderGames();
            renderLessons();
            renderAvailableGames();
            updateStats();
            updatePositionFilter();
        });
    }).catch(err => {
        console.error('Error initializing Supabase:', err);
        // Initialize managers anyway with localStorage fallback
        gameManager = new GameManager();
        lessonManager = new LessonManager();
        
        Promise.all([
            gameManager.init(),
            lessonManager.init()
        ]).then(() => {
            renderGames();
            renderLessons();
            renderAvailableGames();
            updateStats();
            updatePositionFilter();
        }).catch(err => {
            console.error('Error initializing managers:', err);
            renderGames();
            renderLessons();
            renderAvailableGames();
            updateStats();
            updatePositionFilter();
        });
    });
    
    // Load theme immediately (doesn't depend on data)
    loadTheme();
    
    // Set initial ARIA attributes
    document.querySelectorAll('.modal').forEach(modal => {
        modal.setAttribute('aria-hidden', 'true');
    });
});

// Make functions globally available
window.switchTab = switchTab;
window.openNewGameModal = openNewGameModal;
window.editGame = editGame;
window.saveGame = saveGame;
window.deleteGame = deleteGame;
window.toggleGameSelection = toggleGameSelection;
window.removeGameFromLesson = removeGameFromLesson;
window.saveLesson = saveLesson;
window.clearLesson = clearLesson;
window.viewLesson = viewLesson;
window.editLesson = editLesson;
window.deleteLesson = deleteLesson;
window.printLesson = printLesson;
window.closeModal = closeModal;
window.exportAll = exportAll;
window.importAll = importAll;
// refreshData is already assigned above, before DOMContentLoaded
window.toggleTheme = toggleTheme;
window.toggleBulkSelect = toggleBulkSelect;
window.bulkDeleteGames = bulkDeleteGames;
window.showDashboard = showDashboard;

