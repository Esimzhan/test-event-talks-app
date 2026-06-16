/**
 * BigQuery Release Notes Sentinel - Frontend Logic
 */

document.addEventListener('DOMContentLoaded', () => {
    // App State
    const state = {
        rawReleases: [],
        processedUpdates: [],
        filteredUpdates: [],
        activeFilter: 'all',
        searchQuery: '',
        sortOrder: 'newest',
        selectedUpdate: null
    };

    // DOM Elements
    const elements = {
        feedContainer: document.getElementById('feed-container'),
        skeletonLoader: document.getElementById('skeleton-loader'),
        emptyState: document.getElementById('empty-state'),
        btnRefresh: document.getElementById('btn-refresh'),
        spinnerIcon: document.getElementById('spinner-icon'),
        syncText: document.getElementById('sync-text'),
        themeToggle: document.getElementById('btn-theme-toggle'),
        themeIcon: document.getElementById('theme-icon'),
        searchInput: document.getElementById('search-input'),
        btnClearSearch: document.getElementById('btn-clear-search'),
        tabButtons: document.querySelectorAll('.tab-btn'),
        sortSelect: document.getElementById('sort-select'),
        
        // Stats
        statTotal: document.getElementById('stat-total').querySelector('.stat-value'),
        statFeatures: document.getElementById('stat-features').querySelector('.stat-value'),
        statBreaking: document.getElementById('stat-breaking').querySelector('.stat-value'),
        statIssues: document.getElementById('stat-issues').querySelector('.stat-value'),
        
        // Modal
        tweetModal: document.getElementById('tweet-modal'),
        tweetTextarea: document.getElementById('tweet-textarea'),
        charCounter: document.getElementById('char-counter'),
        tweetPreviewText: document.getElementById('tweet-preview-text'),
        btnCloseModal: document.getElementById('btn-close-modal'),
        btnCancelTweet: document.getElementById('btn-cancel-tweet'),
        btnPostTweet: document.getElementById('btn-post-tweet'),
        btnSimulateTweet: document.getElementById('btn-simulate-tweet'),
        tagHelpers: document.querySelectorAll('.tag-helper'),
        
        // Utilities
        toastContainer: document.getElementById('toast-container'),
        confettiCanvas: document.getElementById('confetti-canvas')
    };

    // Initialize App
    init();

    function init() {
        // Setup Lucide Icons
        if (window.lucide) {
            window.lucide.createIcons();
        }

        // Load theme from localStorage
        initTheme();

        // Fetch Release Notes
        fetchReleaseNotes();

        // Attach Event Listeners
        attachEventListeners();
    }

    // --- Theme Management ---
    function initTheme() {
        const savedTheme = localStorage.getItem('theme') || 'dark-theme';
        document.body.className = savedTheme;
        updateThemeIcon(savedTheme);
    }

    function toggleTheme() {
        const newTheme = document.body.classList.contains('dark-theme') ? 'light-theme' : 'dark-theme';
        document.body.className = newTheme;
        localStorage.setItem('theme', newTheme);
        updateThemeIcon(newTheme);
        showToast(`Switched to ${newTheme === 'dark-theme' ? 'Dark' : 'Light'} Mode`, 'info');
    }

    function updateThemeIcon(theme) {
        if (theme === 'dark-theme') {
            elements.themeIcon.setAttribute('data-lucide', 'sun');
        } else {
            elements.themeIcon.setAttribute('data-lucide', 'moon');
        }
        if (window.lucide) {
            window.lucide.createIcons({
                attrs: { id: 'theme-icon' },
                nameAttr: 'data-lucide'
            });
        }
    }

    // --- API & Fetching ---
    async function fetchReleaseNotes(forceRefresh = false) {
        setLoadingState(true);
        elements.syncText.textContent = forceRefresh ? "Fetching latest feed..." : "Syncing...";
        const indicator = document.querySelector('.status-indicator-dot');
        indicator.className = "status-indicator-dot syncing";

        try {
            const response = await fetch(`/api/releases${forceRefresh ? '?refresh=true' : ''}`);
            if (!response.ok) {
                throw new Error(`Server returned code ${response.status}`);
            }
            
            const data = await response.json();
            if (data.success) {
                state.rawReleases = data.releases;
                processReleases(data.releases);
                
                elements.syncText.textContent = `Synced: ${data.last_updated}`;
                indicator.className = "status-indicator-dot synced";
                
                showToast(
                    forceRefresh ? "Feed refreshed from Google servers!" : "Release notes synced successfully.", 
                    'success'
                );
            } else {
                throw new Error(data.error || "Failed parsing API response");
            }
        } catch (error) {
            console.error("Fetch Error:", error);
            elements.syncText.textContent = "Sync failed. Network Error.";
            indicator.className = "status-indicator-dot error";
            showToast(`Error: ${error.message}`, 'error');
            
            // Render cached data if present
            if (state.processedUpdates.length === 0) {
                elements.feedContainer.innerHTML = '';
                elements.emptyState.style.display = 'flex';
            }
        } finally {
            setLoadingState(false);
        }
    }

    function setLoadingState(isLoading) {
        if (isLoading) {
            elements.skeletonLoader.style.display = 'flex';
            elements.feedContainer.style.display = 'none';
            elements.emptyState.style.display = 'none';
            elements.spinnerIcon.classList.add('loading');
            elements.btnRefresh.disabled = true;
        } else {
            elements.skeletonLoader.style.display = 'none';
            elements.feedContainer.style.display = 'flex';
            elements.spinnerIcon.classList.remove('loading');
            elements.btnRefresh.disabled = false;
        }
    }

    // --- Data Parsing & Processing ---
    function processReleases(releases) {
        const updates = [];
        let globalIndex = 0;

        releases.forEach(release => {
            const dateStr = release.title;
            const updatedTimestamp = release.updated;
            const link = release.link;
            
            if (!release.content) return;

            // Parse entry HTML using DOMParser
            const parser = new DOMParser();
            const doc = parser.parseFromString(release.content, 'text/html');
            const children = Array.from(doc.body.children);
            
            let currentType = "Update";
            let currentHtmlElements = [];

            children.forEach(el => {
                const tag = el.tagName.toLowerCase();
                
                if (tag === 'h3') {
                    // Save accumulated elements for the previous header
                    if (currentHtmlElements.length > 0) {
                        updates.push(createUpdateObject(
                            release.id,
                            globalIndex++,
                            dateStr,
                            updatedTimestamp,
                            link,
                            currentType,
                            currentHtmlElements
                        ));
                        currentHtmlElements = [];
                    }
                    currentType = el.textContent.trim();
                } else {
                    currentHtmlElements.push(el);
                }
            });

            // Save final section
            if (currentHtmlElements.length > 0) {
                updates.push(createUpdateObject(
                    release.id,
                    globalIndex++,
                    dateStr,
                    updatedTimestamp,
                    link,
                    currentType,
                    currentHtmlElements
                ));
            }
        });

        state.processedUpdates = updates;
        
        // Update stats dashboard
        calculateStats();
        
        // Filter & Render
        filterAndRender();
    }

    function createUpdateObject(feedId, uniqueId, dateStr, timestamp, link, type, elementsArray) {
        // Clean types into standard buckets (Feature, Breaking, Issue, Other)
        const rawType = type.toLowerCase();
        let displayType = type;
        let category = "other";

        if (rawType.includes('feature') || rawType.includes('preview') || rawType.includes('ga') || rawType.includes('beta')) {
            category = "feature";
        } else if (rawType.includes('breaking') || rawType.includes('deprecation') || rawType.includes('remove')) {
            category = "breaking";
        } else if (rawType.includes('issue') || rawType.includes('bug') || rawType.includes('warning') || rawType.includes('fail')) {
            category = "issue";
        }

        const contentHtml = elementsArray.map(el => el.outerHTML).join('\n');
        
        // Create plaintext representation for search & tweets
        const contentText = elementsArray.map(el => el.textContent).join(' ').replace(/\s+/g, ' ').trim();

        return {
            id: `${feedId}_sub_${uniqueId}`,
            date: dateStr,
            timestamp: timestamp,
            link: link,
            rawType: type,
            type: displayType,
            category: category,
            contentHtml: contentHtml,
            contentText: contentText
        };
    }

    // --- Stats Dashboard ---
    function calculateStats() {
        const total = state.processedUpdates.length;
        const features = state.processedUpdates.filter(u => u.category === 'feature').length;
        const breaking = state.processedUpdates.filter(u => u.category === 'breaking').length;
        const issues = state.processedUpdates.filter(u => u.category === 'issue').length;

        // Animate counter values
        animateCounter(elements.statTotal, total);
        animateCounter(elements.statFeatures, features);
        animateCounter(elements.statBreaking, breaking);
        animateCounter(elements.statIssues, issues);
    }

    function animateCounter(element, target) {
        let current = parseInt(element.textContent, 10) || 0;
        if (current === target) return;
        
        const step = Math.ceil(Math.abs(target - current) / 15) || 1;
        const isGrowing = target > current;
        
        const timer = setInterval(() => {
            if (isGrowing) {
                current += step;
                if (current >= target) {
                    current = target;
                    clearInterval(timer);
                }
            } else {
                current -= step;
                if (current <= target) {
                    current = target;
                    clearInterval(timer);
                }
            }
            element.textContent = current;
        }, 30);
    }

    // --- Filter, Sort, Render ---
    function filterAndRender() {
        // 1. Categorization Tab Filter
        let results = state.processedUpdates;
        if (state.activeFilter !== 'all') {
            results = results.filter(u => u.category === state.activeFilter);
        }

        // 2. Text Search Filter
        if (state.searchQuery) {
            const query = state.searchQuery.toLowerCase();
            results = results.filter(u => 
                u.contentText.toLowerCase().includes(query) ||
                u.date.toLowerCase().includes(query) ||
                u.type.toLowerCase().includes(query)
            );
        }

        // 3. Sorting
        results.sort((a, b) => {
            const timeA = new Date(a.timestamp).getTime();
            const timeB = new Date(b.timestamp).getTime();
            return state.sortOrder === 'newest' ? timeB - timeA : timeA - timeB;
        });

        state.filteredUpdates = results;

        // Render to DOM
        renderFeed();
    }

    function renderFeed() {
        elements.feedContainer.innerHTML = '';
        
        if (state.filteredUpdates.length === 0) {
            elements.emptyState.style.display = 'flex';
            return;
        }

        elements.emptyState.style.display = 'none';

        // Render card elements
        state.filteredUpdates.forEach(update => {
            const card = document.createElement('article');
            card.className = `release-card type-${update.category}`;
            
            // Find icons based on type
            let iconName = 'info';
            if (update.category === 'feature') iconName = 'sparkles';
            else if (update.category === 'breaking') iconName = 'alert-octagon';
            else if (update.category === 'issue') iconName = 'bug';

            card.innerHTML = `
                <header class="card-header">
                    <span class="badge badge-${update.category}">
                        <i data-lucide="${iconName}"></i> ${update.type}
                    </span>
                    <span class="card-date">
                        <i data-lucide="calendar"></i> ${update.date}
                    </span>
                </header>
                <div class="card-body">
                    ${update.contentHtml}
                </div>
                <footer class="card-footer">
                    <button class="btn btn-secondary btn-card-action btn-copy" aria-label="Copy update details">
                        <i data-lucide="copy"></i> Copy
                    </button>
                    <button class="btn btn-tweet btn-card-action btn-tweet-trigger" aria-label="Compose tweet about this update">
                        <i data-lucide="twitter"></i> Tweet
                    </button>
                </footer>
            `;

            // Setup buttons event listeners
            card.querySelector('.btn-copy').addEventListener('click', () => {
                copyToClipboard(update.contentText);
            });

            card.querySelector('.btn-tweet-trigger').addEventListener('click', () => {
                openTweetModal(update);
            });

            elements.feedContainer.appendChild(card);
        });

        // Instantiate Lucide Icons on the page
        if (window.lucide) {
            window.lucide.createIcons();
        }
    }

    // --- Clipboard Utility ---
    function copyToClipboard(text) {
        navigator.clipboard.writeText(text).then(() => {
            showToast("Content copied to clipboard!", "success");
        }).catch(err => {
            console.error("Clipboard Error:", err);
            showToast("Failed to copy content.", "error");
        });
    }

    // --- Toast Notifications ---
    function showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        
        let iconName = 'info';
        if (type === 'success') iconName = 'check-circle';
        else if (type === 'error') iconName = 'alert-triangle';
        else if (type === 'twitter') iconName = 'twitter';

        toast.innerHTML = `
            <i data-lucide="${iconName}" class="toast-icon"></i>
            <span>${message}</span>
            <button class="toast-close" aria-label="Dismiss toast">
                <i data-lucide="x"></i>
            </button>
            <div class="toast-progress"></div>
        `;

        elements.toastContainer.appendChild(toast);
        
        if (window.lucide) {
            window.lucide.createIcons({
                attrs: { class: 'toast-icon' },
                nameAttr: 'data-lucide'
            });
        }

        // Close toast on button click
        toast.querySelector('.toast-close').addEventListener('click', () => {
            removeToast(toast);
        });

        // Auto remove toast
        setTimeout(() => {
            removeToast(toast);
        }, 3500);
    }

    function removeToast(toast) {
        if (!toast.parentNode) return;
        toast.style.animation = 'none';
        toast.offsetHeight; // Trigger reflow
        toast.style.animation = 'toast-slide-in 0.3s cubic-bezier(0.16, 1, 0.3, 1) reverse forwards';
        
        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, 300);
    }

    // --- Tweet Composer Modal ---
    function openTweetModal(update) {
        state.selectedUpdate = update;
        
        // Auto-generate starting tweet text
        const typeText = update.type.trim();
        const dateText = update.date.replace(', 2026', ''); // shorten date
        const prefix = `📢 BQ ${typeText} (${dateText}): `;
        const suffix = ` #BigQuery #GoogleCloud`;
        
        // Remove markdown tags, multiple spaces, keep sentence structure
        const cleanBody = update.contentText
            .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1') // remove markdown links
            .replace(/\s+/g, ' ')
            .trim();
            
        // Max space for body
        const maxBodyLen = 280 - prefix.length - suffix.length - 4;
        let bodyText = cleanBody;
        if (bodyText.length > maxBodyLen) {
            bodyText = bodyText.substring(0, maxBodyLen - 3) + '...';
        }

        const tweetText = `${prefix}${bodyText}${suffix}`;
        
        // Pre-fill text and counter
        elements.tweetTextarea.value = tweetText;
        updateCharCounter();
        updateTweetPreview();

        // Display Modal
        elements.tweetModal.classList.add('open');
        elements.tweetModal.setAttribute('aria-hidden', 'false');
        elements.tweetTextarea.focus();
    }

    function closeTweetModal() {
        elements.tweetModal.classList.remove('open');
        elements.tweetModal.setAttribute('aria-hidden', 'true');
        state.selectedUpdate = null;
    }

    function updateCharCounter() {
        const count = elements.tweetTextarea.value.length;
        elements.charCounter.textContent = `${count} / 280`;
        
        // Coloring classes
        elements.charCounter.className = 'character-counter';
        if (count >= 280) {
            elements.charCounter.classList.add('danger');
        } else if (count >= 250) {
            elements.charCounter.classList.add('warning');
        }
    }

    function updateTweetPreview() {
        const text = elements.tweetTextarea.value;
        
        // Highlight hashtags in preview
        const formattedText = text.replace(/(#[a-zA-Z0-9_]+)/g, '<span style="color: #1d9bf0;">$1</span>');
        
        elements.tweetPreviewText.innerHTML = formattedText || '<span style="color:#71767b; font-style:italic;">Empty tweet composer</span>';
    }

    function addHashtag(tag) {
        const text = elements.tweetTextarea.value;
        if (text.includes(tag)) return; // Already present
        
        const space = text.endsWith(' ') || text === '' ? '' : ' ';
        elements.tweetTextarea.value = `${text}${space}${tag}`;
        updateCharCounter();
        updateTweetPreview();
    }

    function triggerTwitterIntent() {
        const text = elements.tweetTextarea.value;
        const encodedText = encodeURIComponent(text);
        const url = `https://twitter.com/intent/tweet?text=${encodedText}`;
        window.open(url, '_blank');
        
        showToast("Twitter Intent opened in a new tab!", "twitter");
        closeTweetModal();
    }

    // --- Particle Confetti Effect ---
    function simulateTweetSuccess() {
        closeTweetModal();
        showToast("Tweet successfully simulated!", "success");
        
        // Confetti Emitter parameters
        const duration = 2.5 * 1000;
        const animationEnd = Date.now() + duration;
        const canvas = elements.confettiCanvas;
        const ctx = canvas.getContext('2d');
        
        // Canvas resizing
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        
        window.addEventListener('resize', () => {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        });

        const colors = ['#1d9bf0', '#10b981', '#a855f7', '#3b82f6', '#f59e0b', '#ec4899'];
        const particles = [];

        function createParticle() {
            return {
                x: Math.random() * canvas.width,
                y: canvas.height + 20, // Start below canvas
                size: Math.random() * 8 + 6,
                color: colors[Math.floor(Math.random() * colors.length)],
                speedY: -(Math.random() * 8 + 12),
                speedX: Math.random() * 6 - 3,
                rotation: Math.random() * 360,
                rotationSpeed: Math.random() * 6 - 3,
                gravity: 0.35,
                opacity: 1
            };
        }

        // Generate initial blast particles
        for (let i = 0; i < 120; i++) {
            particles.push(createParticle());
        }

        function draw() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            
            particles.forEach((p, idx) => {
                p.speedY += p.gravity;
                p.x += p.speedX;
                p.y += p.speedY;
                p.rotation += p.rotationSpeed;
                
                // Slow decay opacity once falling
                if (p.speedY > 0) {
                    p.opacity -= 0.012;
                }

                // Render particle
                ctx.save();
                ctx.translate(p.x, p.y);
                ctx.rotate(p.rotation * Math.PI / 180);
                ctx.fillStyle = p.color;
                ctx.globalAlpha = Math.max(0, p.opacity);
                ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
                ctx.restore();

                // Remove transparent or out of bounds particles
                if (p.opacity <= 0 || p.y > canvas.height + 30 || p.x < -30 || p.x > canvas.width + 30) {
                    particles.splice(idx, 1);
                }
            });

            if (Date.now() < animationEnd || particles.length > 0) {
                requestAnimationFrame(draw);
            } else {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
            }
        }

        draw();
    }

    // --- Event Listeners Mapping ---
    function attachEventListeners() {
        // Refresh Feed
        elements.btnRefresh.addEventListener('click', () => {
            fetchReleaseNotes(true);
        });

        // Theme Toggle
        elements.themeToggle.addEventListener('click', toggleTheme);

        // Search inputs
        elements.searchInput.addEventListener('input', (e) => {
            state.searchQuery = e.target.value;
            elements.btnClearSearch.style.display = state.searchQuery ? 'block' : 'none';
            filterAndRender();
        });

        elements.btnClearSearch.addEventListener('click', () => {
            elements.searchInput.value = '';
            state.searchQuery = '';
            elements.btnClearSearch.style.display = 'none';
            elements.searchInput.focus();
            filterAndRender();
        });

        // Category Tab buttons
        elements.tabButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                elements.tabButtons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                state.activeFilter = btn.getAttribute('data-filter');
                
                // Update Accessibility roles
                elements.tabButtons.forEach(b => b.setAttribute('aria-selected', 'false'));
                btn.setAttribute('aria-selected', 'true');
                
                filterAndRender();
            });
        });

        // Sorting
        elements.sortSelect.addEventListener('change', (e) => {
            state.sortOrder = e.target.value;
            filterAndRender();
        });

        // Modal Composer Events
        elements.tweetTextarea.addEventListener('input', () => {
            updateCharCounter();
            updateTweetPreview();
        });

        elements.tagHelpers.forEach(tagBtn => {
            tagBtn.addEventListener('click', () => {
                addHashtag(tagBtn.getAttribute('data-tag'));
            });
        });

        elements.btnCloseModal.addEventListener('click', closeTweetModal);
        elements.btnCancelTweet.addEventListener('click', closeTweetModal);
        elements.btnPostTweet.addEventListener('click', triggerTwitterIntent);
        elements.btnSimulateTweet.addEventListener('click', simulateTweetSuccess);

        // Close modal clicking outside the modal-card
        elements.tweetModal.addEventListener('click', (e) => {
            if (e.target === elements.tweetModal) {
                closeTweetModal();
            }
        });

        // Escape key closes modal
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && elements.tweetModal.classList.contains('open')) {
                closeTweetModal();
            }
        });
    }
});
