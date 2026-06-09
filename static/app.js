// Base URL for backend API queries (useful when frontend is hosted on Netlify and backend on Render)
const API_BASE = window.BACKEND_API_URL || 
    ((window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
        ? ''
        : 'https://shanks-backend.onrender.com'); // Replace with actual backend Render URL when deployed

document.addEventListener('DOMContentLoaded', () => {
    // Current Chart.js instance tracking to prevent canvas overlap
    let searchChart = null;

    // DOM Elements
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabPanels = document.querySelectorAll('.tab-panel');
    
    // KPI elements
    const kpiTotalMessages = document.getElementById('kpi-total-messages');
    const kpiUniqueChatters = document.getElementById('kpi-unique-chatters');
    const kpiSubRatio = document.getElementById('kpi-sub-ratio');
    const kpiModRatio = document.getElementById('kpi-mod-ratio');
    const kpiTotalVods = document.getElementById('kpi-total-vods');

    // Leaderboards tables
    const tableTopChatters = document.getElementById('table-top-chatters');
    const tableTopSubs = document.getElementById('table-top-subs');
    const tableTopMods = document.getElementById('table-top-mods');
    const tableTopEmotes = document.getElementById('table-top-emotes');
    const tableTopWords = document.getElementById('table-top-words');
    const tableTopDays = document.getElementById('table-top-days');
    const tableVodList = document.getElementById('table-vod-list');

    // Search elements
    const searchInput = document.getElementById('word-search-input');
    const searchBtn = document.getElementById('word-search-btn');
    const suggestionPills = document.getElementById('suggestion-pills');
    const searchPromptState = document.getElementById('search-prompt-state');
    const searchLoadingState = document.getElementById('search-loading-state');
    const searchResults = document.getElementById('search-results');
    const searchKpiWord = document.getElementById('search-kpi-word');
    const searchTotalCount = document.getElementById('search-total-count');
    const tableSearchUsers = document.getElementById('table-search-users');
    const searchChatLogs = document.getElementById('search-chat-logs');



    // Helper: format numbers with commas
    const formatNum = (num) => {
        if (num === undefined || num === null) return '0';
        return num.toLocaleString();
    };

    // Helper: format duration strings to look clean
    const formatDuration = (dur) => {
        if (!dur || dur === 'N/A') return 'N/A';
        return dur.replace('h', 'h ').replace('m', 'm ').replace('s', 's');
    };

    // Helper: format timestamp strings
    const formatTimestamp = (ts) => {
        if (!ts) return 'N/A';
        const date = new Date(ts);
        const yyyy = date.getFullYear();
        const mm = String(date.getMonth() + 1).padStart(2, '0');
        const dd = String(date.getDate()).padStart(2, '0');
        const hh = String(date.getHours()).padStart(2, '0');
        const min = String(date.getMinutes()).padStart(2, '0');
        const sec = String(date.getSeconds()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd} ${hh}:${min}:${sec}`;
    };

    // Tab Switching Logic
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetTab = btn.getAttribute('data-tab');
            
            // Toggle buttons active state
            tabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            // Toggle panels visible state
            tabPanels.forEach(panel => {
                if (panel.id === targetTab) {
                    panel.classList.add('active');
                } else {
                    panel.classList.remove('active');
                }
            });
        });
    });

    // Fetch and populate precalculated dashboard statistics
    const loadDashboardStats = () => {
        fetch(`${API_BASE}/api/stats`)
            .then(res => {
                if (!res.ok) throw new Error('Stats API failed');
                return res.json();
            })
            .then(data => {
                // Populate KPIs
                const kpis = data.kpis;
                kpiTotalMessages.textContent = formatNum(kpis.total_messages);
                kpiUniqueChatters.textContent = formatNum(kpis.total_chatters);
                
                const subPct = ((kpis.subscriber_messages / kpis.total_messages) * 100).toFixed(1);
                kpiSubRatio.textContent = `${subPct}%`;

                const modPct = ((kpis.moderator_messages / kpis.total_messages) * 100).toFixed(1);
                kpiModRatio.textContent = `${modPct}%`;
                
                kpiTotalVods.textContent = kpis.total_vods;

                // Populate Top Chatters
                tableTopChatters.innerHTML = data.top_chatters.map(user => `
                    <tr>
                        <td style="font-weight: 500;">${user.username}</td>
                        <td class="align-right">${formatNum(user.count)}</td>
                    </tr>
                `).join('');

                // Populate Top Subs
                tableTopSubs.innerHTML = data.top_subs.map(user => `
                    <tr>
                        <td style="font-weight: 500;">${user.username}</td>
                        <td class="align-right">${formatNum(user.count)}</td>
                    </tr>
                `).join('');

                // Populate Top Mods
                tableTopMods.innerHTML = data.top_mods.map(user => `
                    <tr>
                        <td style="font-weight: 500;">${user.username}</td>
                        <td class="align-right">${formatNum(user.count)}</td>
                    </tr>
                `).join('');

                // Populate Top Emotes
                tableTopEmotes.innerHTML = data.top_emotes.map(emote => `
                    <tr>
                        <td style="font-weight: 600;"><span class="emote-pill">${emote.name}</span></td>
                        <td style="color: var(--text-secondary); font-family: monospace; font-size: 0.8rem;">${emote.id}</td>
                        <td class="align-right">${formatNum(emote.count)}</td>
                    </tr>
                `).join('');

                // Populate Top Words
                tableTopWords.innerHTML = data.top_words.map(w => `
                    <tr>
                        <td style="font-weight: 500; font-family: monospace;">${w.word}</td>
                        <td class="align-right">${formatNum(w.count)}</td>
                    </tr>
                `).join('');

                // Populate Top Days
                tableTopDays.innerHTML = data.top_days.map(d => `
                    <tr>
                        <td style="font-family: monospace;">${d.date}</td>
                        <td class="align-right">${formatNum(d.count)}</td>
                    </tr>
                `).join('');

                // Populate VOD List
                tableVodList.innerHTML = data.top_vods.map(vod => `
                    <tr>
                        <td style="font-family: monospace; font-size: 0.85rem; color: var(--text-secondary);">${vod.vod_id}</td>
                        <td style="font-weight: 500; max-width: 300px; text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">${vod.title}</td>
                        <td style="font-family: monospace;">${vod.date.substring(0, 10)}</td>
                        <td style="color: var(--text-secondary);">${formatDuration(vod.duration)}</td>
                        <td style="color: var(--text-secondary);">${formatNum(vod.views)}</td>
                        <td class="align-right" style="font-weight: 600;">${formatNum(vod.total_messages || vod.count)}</td>
                        <td><a href="${vod.url}" target="_blank" class="vod-link">Twitch Link &rarr;</a></td>
                    </tr>
                `).join('');


            })
            .catch(err => {
                console.error("Dashboard stats failed to load:", err);
            });
    };

    // Keyword Search Handler
    const executeSearch = (keyword) => {
        if (!keyword) return;
        
        // Update UI States to show loading spinner
        searchPromptState.style.display = 'none';
        searchResults.style.display = 'none';
        searchLoadingState.style.display = 'block';

        fetch(`${API_BASE}/api/search?q=${encodeURIComponent(keyword)}`)
            .then(res => {
                if (!res.ok) throw new Error('Search failed');
                return res.json();
            })
            .then(data => {
                searchLoadingState.style.display = 'none';
                searchResults.style.display = 'block';

                // Update search KPIs
                searchKpiWord.textContent = data.query;
                searchTotalCount.textContent = formatNum(data.total_count);

                // Populate Top Speakers
                if (data.top_users.length === 0) {
                    tableSearchUsers.innerHTML = `<tr><td colspan="2" class="placeholder">No data found</td></tr>`;
                } else {
                    tableSearchUsers.innerHTML = data.top_users.map(user => `
                        <tr>
                            <td style="font-weight: 500;">${user.username}</td>
                            <td class="align-right" style="font-weight: 600;">${formatNum(user.count)}</td>
                        </tr>
                    `).join('');
                }

                // Populate Sample Chat Logs (Terminal Style)
                if (data.samples.length === 0) {
                    searchChatLogs.innerHTML = `<div class="chat-line" style="color: var(--text-secondary); font-style: italic; text-align: center;">No chat message logs found for this search.</div>`;
                } else {
                    searchChatLogs.innerHTML = data.samples.map(msg => `
                        <div class="chat-line">
                            <span class="chat-time">[${formatTimestamp(msg.timestamp)}]</span>
                            <span class="chat-user">${msg.username}:</span>
                            <span class="chat-msg">${msg.message}</span>
                            <span class="chat-stream-context">&bull; VOD: ${msg.stream_title}</span>
                        </div>
                    `).join('');
                }

                // Draw Sparkline Trend Chart (Using Chart.js)
                renderTrendChart(data.trends);
            })
            .catch(err => {
                searchLoadingState.style.display = 'none';
                searchPromptState.style.display = 'block';
                searchPromptState.innerHTML = `<p style="color: #ef4444;">Search request failed. Please check backend connection.</p>`;
                console.error("Search query failed:", err);
            });
    };

    // Helper: Render minimalist trend chart
    const renderTrendChart = (trends) => {
        const ctx = document.getElementById('search-trend-chart').getContext('2d');

        // Destroy previous chart instance if it exists to clean canvas state
        if (searchChart) {
            searchChart.destroy();
        }

        if (trends.length === 0) {
            ctx.clearRect(0, 0, 400, 300);
            return;
        }

        const labels = trends.map(t => t.date);
        const counts = trends.map(t => t.count);

        searchChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Occurrences',
                    data: counts,
                    borderColor: '#7c3aed',
                    borderWidth: 1.5,
                    fill: false,
                    pointBackgroundColor: '#7c3aed',
                    pointRadius: 2,
                    pointHoverRadius: 5,
                    tension: 0.1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    x: {
                        grid: { display: false },
                        ticks: {
                            font: { family: 'JetBrains Mono', size: 9 },
                            color: '#8e94a0',
                            maxTicksLimit: 8
                        }
                    },
                    y: {
                        grid: { color: '#1e2024' },
                        ticks: {
                            font: { family: 'JetBrains Mono', size: 9 },
                            color: '#8e94a0',
                            precision: 0
                        }
                    }
                }
            }
        });
    };



    // Search Trigger Bindings
    searchBtn.addEventListener('click', () => {
        executeSearch(searchInput.value.trim());
    });

    searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            executeSearch(searchInput.value.trim());
        }
    });

    // Pill badge click actions (redirects straight to search tab & runs keyword search)
    suggestionPills.addEventListener('click', (e) => {
        const target = e.target;
        if (target.classList.contains('pill-badge')) {
            const word = target.getAttribute('data-word');
            searchInput.value = word;
            
            // Switch tabs to Word Search tab first
            const searchTabBtn = document.querySelector('.tab-btn[data-tab="tab-search"]');
            if (searchTabBtn) {
                searchTabBtn.click();
            }

            executeSearch(word);
        }
    });

    // Kickoff Dashboard Loading on start
    loadDashboardStats();
});
