document.addEventListener('DOMContentLoaded', () => {
    // =============================
    // ELEMENTS
    // =============================
    const appEl = document.querySelector('.app');
    const refreshBtn = document.getElementById('refreshBtn');
    const statusEl = document.getElementById('status');
    const scheduleListContainer = document.getElementById('schedule-list');
    const dateRangeEl = document.getElementById('date-range');
    const totalHoursHeaderEl = document.getElementById('total-hours-header');
    const totalPayHeaderEl = document.getElementById('total-pay-header');
    const netPayHeaderEl = document.getElementById('net-pay-header');
    const themeToggle = document.getElementById('theme-toggle');
    const prevMonthBtn = document.getElementById('prev-month-btn');
    const nextMonthBtn = document.getElementById('next-month-btn');
    const todayBtn = document.getElementById('today-btn');
    const monthNameEl = document.getElementById('month-name');
    const filterBtns = document.querySelectorAll('.filter-btn');
    const exportCsvBtn = document.getElementById('export-csv');
    const nextShiftTickerEl = document.getElementById('next-shift-ticker');
    const twoFaModal = document.getElementById('twoFaModal');
    const twoFaInput = document.getElementById('twoFaInput');
    const twoFaSubmit = document.getElementById('twoFaSubmit');
    const twoFaCancel = document.getElementById('twoFaCancel');

    // NEW: Settings Modal Elements
    const settingsBtn = document.getElementById('settingsBtn');
    const settingsModal = document.getElementById('settingsModal');
    const settingsSaveBtn = document.getElementById('settingsSave');
    const settingsCancelBtn = document.getElementById('settingsCancel');
    const walmartRateInput = document.getElementById('walmart-rate');
    const canesRateInput = document.getElementById('canes-rate');
    const takeHomePercentInput = document.getElementById('take-home-percent');
    const serverIpInput = document.getElementById('server-ip-input');

    // NEW: View Switcher Elements
    const mainContent = document.getElementById('main-content');
    const scheduleView = document.getElementById('schedule-view');
    const analyticsView = document.getElementById('analytics-view');
    const viewBtns = document.querySelectorAll('.view-btn');

    // NEW: Analytics Elements
    const earningsChartCanvas = document.getElementById('earnings-chart');
    const paycheckEstimateEl = document.getElementById('paycheck-estimate');
    let earningsChart = null;

    // NEW: Pull to Refresh Elements
    const pullToRefreshEl = document.getElementById('pull-to-refresh');

    // =============================
    // STATE
    // =============================
    let appState = {
        waitingForResult: false,
        allShifts: [],
        selectedDate: new Date(),
        currentFilter: 'all',
        payRates: { walmart: 13.87, canes: 14.25 },
        takeHomePercent: 87,
        serverUrl: "", // Start with no default server URL
        currentView: 'schedule'
    };

    // =============================
    // INITIAL LOAD
    // =============================
    function initialLoad() {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/service-worker.js')
                .then(registration => console.log('Service Worker registered with scope:', registration.scope))
                .catch(error => console.error('Service Worker registration failed:', error));
        }
        loadSettings();
        loadSchedule(); // This will now use the robust loading logic
        setInterval(updateNextShiftTicker, 60000);
        addTouchListeners();
    }

    // UPDATED loadSchedule function for GitHub Pages
    async function loadSchedule() {
        const savedUrl = appState.serverUrl;
        let loadedFromServer = false;

        // First, try to fetch from the saved server IP
        if (savedUrl && savedUrl.startsWith('http')) {
            try {
                statusEl.textContent = 'Fetching schedule from server...';
                const res = await fetch(`${savedUrl}/combined_schedule`, { cache: 'no-store' });
                if (!res.ok) throw new Error(`Server returned status: ${res.status}`);
                const data = await res.json();
                saveToLocalStorage('scheduleData', data);
                processAndRender(data);
                loadedFromServer = true;
            } catch (err) {
                console.warn(`Could not fetch from server (${savedUrl}):`, err.message);
                statusEl.textContent = 'Server not found. Using local data.';
            }
        }

        // If server fetch failed or wasn't tried, use local/fallback data
        if (!loadedFromServer) {
            try {
                statusEl.textContent = 'Loading saved/local schedule...';
                // Try localStorage first
                const localData = getFromLocalStorage('scheduleData');
                if (localData) {
                    processAndRender(localData);
                } else {
                    // Fallback to the placeholder file in the public folder
                    const res = await fetch('combined_schedule.json');
                    const data = await res.json();
                    processAndRender(data);
                }
            } catch (err) {
                console.error('Failed to load local or fallback schedule:', err);
                statusEl.textContent = 'No schedule found. Refresh or check settings.';
                renderEmptyState();
            }
        }
    }


    initialLoad();

    // =============================
    // DATA PROCESSING & RENDERING
    // =============================
    function processAndRender(data) {
        appState.allShifts = parseShifts(data);
        if (appState.allShifts.length === 0) {
            renderEmptyState();
            return;
        }
        detectOverlaps();
        updateNextShiftTicker();
        renderAll();
        statusEl.textContent = 'Schedule loaded successfully.';
    }

    function renderAll() {
        if (appState.currentView === 'schedule') {
            renderCalendarView();
            renderScheduleList();
        } else if (appState.currentView === 'analytics') {
            renderAnalytics();
        }
        updateHeaderInfo();
    }
    
    function renderEmptyState() {
        scheduleListContainer.innerHTML = `<div class="shift-card"><p>🎉 No shifts found! Enjoy your time off.</p></div>`;
        const calendarGrid = document.getElementById('calendar-grid');
        if (calendarGrid) calendarGrid.innerHTML = '';
        updateHeaderInfo();
    }

    function updateHeaderInfo() {
        const shifts = appState.allShifts;
        if (shifts.length === 0) {
            dateRangeEl.textContent = "No shifts";
            totalHoursHeaderEl.textContent = "0h";
            totalPayHeaderEl.textContent = "$0.00";
            netPayHeaderEl.textContent = "$0.00";
            return;
        };
        const firstDate = parseYMDAsLocal(shifts[0].date);
        const lastDate = parseYMDAsLocal(shifts[shifts.length - 1].date);
        const format = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        dateRangeEl.textContent = `${format(firstDate)} - ${format(lastDate)}`;
        const totalPaidHours = shifts.reduce((acc, shift) => acc + (shift.paidHours || 0), 0);
        totalHoursHeaderEl.textContent = `${totalPaidHours.toFixed(1)}h Paid`;
        const totalPay = shifts.reduce((acc, shift) => acc + (shift.grossPay || 0), 0);
        totalPayHeaderEl.textContent = `~$${totalPay.toFixed(2)}`;
        const netPay = shifts.reduce((acc, shift) => acc + (shift.netPay || 0), 0);
        netPayHeaderEl.textContent = `~$${netPay.toFixed(2)}`;
    }

    // =============================
    // CALENDAR VIEW
    // =============================
    function renderCalendarView() {
        const date = appState.selectedDate;
        const year = date.getFullYear();
        const month = date.getMonth();
        if (monthNameEl) monthNameEl.textContent = date.toLocaleString('default', { month: 'long', year: 'numeric' });
        const shiftsInMonth = appState.allShifts.filter(s => {
            const d = parseYMDAsLocal(s.date);
            return d.getFullYear() === year && d.getMonth() === month;
        });
        const shiftDates = new Set(shiftsInMonth.map(s => s.date));
        let calendarHTML = `${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => `<div class="day-name">${d}</div>`).join('')}`;
        const start = new Date(year, month, 1);
        const end = new Date(year, month + 1, 0);
        const totalDays = end.getDate();
        const firstWeekday = start.getDay();
        for (let i = 0; i < firstWeekday; i++) calendarHTML += `<div class="day-cell other-month"></div>`;
        for (let day = 1; day <= totalDays; day++) {
            const currentDate = new Date(year, month, day);
            const dateStr = formatLocalDate(currentDate);
            const classes = ['day-cell'];
            if (isSameDay(currentDate, new Date())) classes.push('today');
            if (isSameDay(currentDate, appState.selectedDate)) classes.push('selected');
            if (shiftDates.has(dateStr)) classes.push('has-shift');
            calendarHTML += `<div class="${classes.join(' ')}" data-date="${dateStr}">${day}</div>`;
        }
        const lastDay = new Date(year, month, totalDays);
        const remaining = 6 - lastDay.getDay();
        for (let i = 0; i < remaining; i++) calendarHTML += `<div class="day-cell other-month"></div>`;
        const grid = document.getElementById('calendar-grid');
        if (grid) grid.innerHTML = calendarHTML;
        document.querySelectorAll('.day-cell:not(.other-month)').forEach(cell => {
            cell.addEventListener('click', () => {
                triggerHapticFeedback();
                appState.selectedDate = parseYMDAsLocal(cell.dataset.date);
                renderAll();
                const targetCard = document.getElementById(`shift-card-${cell.dataset.date}`);
                if (targetCard) targetCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
            });
        });
    }

    // =============================
    // SCHEDULE LIST VIEW
    // =============================
    function renderScheduleList() {
        const date = appState.selectedDate;
        const year = date.getFullYear();
        const month = date.getMonth();
        const shiftsInMonth = appState.allShifts.filter(s => {
            const d = parseYMDAsLocal(s.date);
            return d.getFullYear() === year && d.getMonth() === month &&
                   (appState.currentFilter === 'all' || s.source === appState.currentFilter);
        });
        if (shiftsInMonth.length === 0) {
            scheduleListContainer.innerHTML = `<div class="shift-card"><p>No shifts for this filter in ${monthNameEl.textContent}.</p></div>`;
            return;
        }
        const shiftsByDay = shiftsInMonth.reduce((acc, shift) => {
            (acc[shift.date] = acc[shift.date] || []).push(shift);
            return acc;
        }, {});
        let listHTML = '';
        let currentWeek = -1;
        const sortedDays = Object.keys(shiftsByDay).sort();
        sortedDays.forEach(dateStr => {
            const dayShifts = shiftsByDay[dateStr];
            const d = parseYMDAsLocal(dateStr);
            const week = getWeekNumber(d);
            if (week !== currentWeek) {
                if (currentWeek !== -1) {
                    const weekShifts = shiftsInMonth.filter(s => getWeekNumber(parseYMDAsLocal(s.date)) === currentWeek);
                    const weeklyPaidHours = weekShifts.reduce((sum, s) => sum + s.paidHours, 0);
                    const weeklyNetPay = weekShifts.reduce((sum, s) => sum + s.netPay, 0);
                    listHTML += `<div class="shift-card week-summary"><strong>Week ${currentWeek} Total:</strong> ${weeklyPaidHours.toFixed(2)}h Paid, ~$${weeklyNetPay.toFixed(2)} Take-Home</div>`;
                }
                currentWeek = week;
            }
            const dailyTotalPaidHours = dayShifts.reduce((sum, s) => sum + s.paidHours, 0);
            const dailyTotalNetPay = dayShifts.reduce((sum, s) => sum + s.netPay, 0);
            const sources = [...new Set(dayShifts.map(s => s.source))];
            const cardClass = sources.length > 1 ? 'multi' : sources[0] || '';
            listHTML += `
                <div id="shift-card-${dateStr}" class="shift-card ${cardClass}">
                    <div class="card-date">
                        <span class="weekday">${getShortWeekday(d)}</span>
                        <span class="day">${d.getDate()}</span>
                    </div>
                    <div class="card-details">
                        <div class="job-info-container">`;
            dayShifts.forEach(shift => {
                listHTML += `
                    <div class="job-info">
                        <div class="job-title">
                            ${shift.job}
                            ${shift.hasOverlap ? '<span class="overlap-badge">Overlap!</span>' : ''}
                        </div>
                        <div class="time-badge ${shift.source}">
                            <span>${shift.start} - ${shift.end} (${shift.paidHours.toFixed(2)}h paid)</span>
                        </div>
                    </div>`;
            });
            listHTML += `
                        </div>
                        <div class="card-hours">
                            <div class="hours">${dailyTotalPaidHours.toFixed(2)}h</div>
                            <div class="store">~$${dailyTotalNetPay.toFixed(2)}</div>
                        </div>
                    </div>
                </div>`;
        });
        if (currentWeek !== -1) {
            const lastWeekShifts = shiftsInMonth.filter(s => getWeekNumber(parseYMDAsLocal(s.date)) === currentWeek);
            const lastWeeklyPaidHours = lastWeekShifts.reduce((sum, s) => sum + s.paidHours, 0);
            const lastWeeklyNetPay = lastWeekShifts.reduce((sum, s) => sum + s.netPay, 0);
            listHTML += `<div class="shift-card week-summary"><strong>Week ${currentWeek} Total:</strong> ${lastWeeklyPaidHours.toFixed(2)}h Paid, ~$${lastWeeklyNetPay.toFixed(2)} Take-Home</div>`;
        }
        scheduleListContainer.innerHTML = listHTML;
    }

    // =============================
    // ANALYTICS VIEW
    // =============================
    function renderAnalytics() {
        if (appState.allShifts.length === 0) {
            paycheckEstimateEl.innerHTML = `<p>No shift data to analyze.</p>`;
            return;
        }
        const weeklyData = appState.allShifts.reduce((acc, shift) => {
            const week = getWeekNumber(parseYMDAsLocal(shift.date));
            const weekLabel = `Week ${week}`;
            if (!acc[weekLabel]) acc[weekLabel] = 0;
            acc[weekLabel] += shift.grossPay;
            return acc;
        }, {});
        const labels = Object.keys(weeklyData);
        const data = Object.values(weeklyData);
        if (earningsChart) earningsChart.destroy();
        earningsChart = new Chart(earningsChartCanvas, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Gross Earnings',
                    data: data,
                    backgroundColor: 'rgba(59, 130, 246, 0.5)',
                    borderColor: 'rgba(59, 130, 246, 1)',
                    borderWidth: 1
                }]
            },
            options: { scales: { y: { beginAtZero: true } } }
        });
        const today = new Date();
        const currentWeek = getWeekNumber(today);
        const lastWeek = currentWeek - 1;
        const paycheckShifts = appState.allShifts.filter(s => {
            const week = getWeekNumber(parseYMDAsLocal(s.date));
            return week === currentWeek || week === lastWeek;
        });
        const grossPay = paycheckShifts.reduce((sum, s) => sum + s.grossPay, 0);
        const netPay = grossPay * (appState.takeHomePercent / 100);
        paycheckEstimateEl.innerHTML = `
            <h3>Next Paycheck Estimate</h3>
            <p>(Based on shifts for Week ${lastWeek} & ${currentWeek})</p>
            <p><strong>Gross Pay:</strong> ~$${grossPay.toFixed(2)}</p>
            <p><strong>Take-Home Pay:</strong> ~$${netPay.toFixed(2)}</p>
        `;
    }

    // =============================
    // API & EVENT HANDLERS
    // =============================
    async function startRefresh() {
        if (appState.waitingForResult) return;
        appState.waitingForResult = true;
        refreshBtn.classList.add('loading');
        statusEl.textContent = 'Starting refresh...';
        try {
            const startRes = await fetch(`${appState.serverUrl}/schedule`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
            const startJson = await startRes.json();
            if (startJson.needs2FA) {
                statusEl.textContent = 'Server requires 2FA code.';
                showModal(twoFaModal);
            } else if (startJson.error) {
                throw new Error(startJson.error);
            } else {
                saveToLocalStorage('scheduleData', startJson);
                processAndRender(startJson);
            }
        } catch (err) {
            console.error(err);
            statusEl.textContent = `Error: ${err.message}`;
        } finally {
            appState.waitingForResult = false;
            refreshBtn.classList.remove('loading');
        }
    }

    async function sendCode() {
        const code = twoFaInput.value.trim();
        if (!code) { alert('Please enter a 2FA code.'); return; }
        hideModal(twoFaModal);
        statusEl.textContent = 'Submitting 2FA code...';
        try {
            const res = await fetch(`${appState.serverUrl}/schedule`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ twoFACode: code }) });
            const data = await res.json();
            if (data.error) throw new Error(data.error);
            saveToLocalStorage('scheduleData', data);
            processAndRender(data);
        } catch (err) {
            console.error(err);
            statusEl.textContent = `Failed to fetch: ${err.message}`;
        } finally {
            appState.waitingForResult = false;
            refreshBtn.classList.remove('loading');
        }
    }

    let holdTimeout;
    const holdDuration = 1500;

    function startHold(event) {
        event.preventDefault(); 
        refreshBtn.classList.add('holding');
        holdTimeout = setTimeout(() => {
            triggerHapticFeedback();
            startRefresh();
            cancelHold();
        }, holdDuration);
    }

    function cancelHold() {
        clearTimeout(holdTimeout);
        refreshBtn.classList.remove('holding');
    }

    refreshBtn.addEventListener('mousedown', startHold);
    refreshBtn.addEventListener('touchstart', startHold, { passive: false });
    refreshBtn.addEventListener('mouseup', cancelHold);
    refreshBtn.addEventListener('mouseleave', cancelHold);
    refreshBtn.addEventListener('touchend', cancelHold);

    twoFaSubmit.addEventListener('click', () => { triggerHapticFeedback(); sendCode(); });
    twoFaCancel.addEventListener('click', () => {
        triggerHapticFeedback();
        hideModal(twoFaModal);
        appState.waitingForResult = false;
        refreshBtn.classList.remove('loading');
        statusEl.textContent = 'Refresh cancelled.';
    });
    themeToggle.addEventListener('change', () => {
        document.body.classList.toggle('dark-mode', themeToggle.checked);
        saveSettings();
    });
    prevMonthBtn.addEventListener('click', () => { triggerHapticFeedback(); appState.selectedDate.setMonth(appState.selectedDate.getMonth() - 1); renderAll(); });
    nextMonthBtn.addEventListener('click', () => { triggerHapticFeedback(); appState.selectedDate.setMonth(appState.selectedDate.getMonth() + 1); renderAll(); });
    todayBtn.addEventListener('click', () => { triggerHapticFeedback(); appState.selectedDate = new Date(); renderAll(); });
    filterBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            triggerHapticFeedback();
            appState.currentFilter = btn.dataset.filter;
            filterBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            renderScheduleList();
        });
    });
    exportCsvBtn.addEventListener('click', () => { triggerHapticFeedback(); exportToCsv(); });
    settingsBtn.addEventListener('click', () => { triggerHapticFeedback(); showModal(settingsModal); });
    settingsCancelBtn.addEventListener('click', () => { triggerHapticFeedback(); hideModal(settingsModal); });
    
    settingsSaveBtn.addEventListener('click', () => {
        triggerHapticFeedback();
        const newUrl = serverIpInput.value.trim();
        appState.serverUrl = newUrl; // Allow it to be empty
        appState.payRates.walmart = parseFloat(walmartRateInput.value) || 0;
        appState.payRates.canes = parseFloat(canesRateInput.value) || 0;
        appState.takeHomePercent = parseInt(takeHomePercentInput.value, 10) || 87;
        saveSettings();
        hideModal(settingsModal);
        loadSchedule(); 
    });

    viewBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            triggerHapticFeedback();
            const view = btn.dataset.view;
            if (appState.currentView === view) return;
            appState.currentView = view;
            viewBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            if (view === 'schedule') {
                scheduleView.classList.remove('hidden');
                analyticsView.classList.add('hidden');
            } else {
                scheduleView.classList.add('hidden');
                analyticsView.classList.remove('hidden');
            }
            renderAll();
        });
    });

    // =============================
    // TOUCH GESTURES
    // =============================
    function addTouchListeners() {
        let touchStartX = 0, touchStartY = 0;
        const deadzone = 50;
        const pullThreshold = 120; 

        const calendarView = document.getElementById('calendar-view');

        calendarView.addEventListener('touchstart', e => { touchStartX = e.changedTouches[0].screenX; }, { passive: true });
        calendarView.addEventListener('touchend', e => {
            const touchEndX = e.changedTouches[0].screenX;
            if (touchEndX < touchStartX - deadzone) nextMonthBtn.click();
            if (touchEndX > touchStartX + deadzone) prevMonthBtn.click();
        }, { passive: true });
        
        document.body.addEventListener('touchstart', e => {
            touchStartY = e.touches[0].clientY;
        }, { passive: true });

        document.body.addEventListener('touchmove', e => {
            const pullDistance = e.touches[0].clientY - touchStartY;
            if (window.scrollY === 0 && pullDistance > 0) {
                e.preventDefault(); 
                const pullRatio = Math.min(pullDistance / pullThreshold, 1);
                const pullRotation = pullRatio * 180;
                const distanceToShow = Math.min(pullDistance, pullThreshold);
                appEl.style.transform = `translateY(${distanceToShow}px)`;
                pullToRefreshEl.classList.add('visible');
                const refreshIcon = pullToRefreshEl.querySelector('.icon');
                const refreshText = pullToRefreshEl.querySelector('.text');
                refreshIcon.style.transform = `rotate(${pullRotation}deg)`;
                refreshText.textContent = pullRatio >= 1 ? 'Release to refresh' : 'Pull down to refresh';
            }
        }, { passive: false });

        document.body.addEventListener('touchend', e => {
            const pullDistance = e.changedTouches[0].clientY - touchStartY;
            if (window.scrollY === 0 && pullDistance > pullThreshold) {
                startRefresh();
            }
            appEl.style.transform = 'translateY(0px)';
            pullToRefreshEl.classList.remove('visible');
            const refreshIcon = pullToRefreshEl.querySelector('.icon');
            const refreshText = pullToRefreshEl.querySelector('.text');
            refreshIcon.style.transform = 'rotate(0deg)';
            refreshText.textContent = 'Pull down to refresh';
            touchStartY = 0;
        });
    }

    // =============================
    // HELPERS
    // =============================
    function pad(n){ return String(n).padStart(2, '0'); }
    function formatLocalDate(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
    function parseYMDAsLocal(ymd) { if (!ymd) return null; const [y, m, day] = ymd.split('-').map(Number); return new Date(y, m - 1, day); }
    function getShortWeekday(d) { return d.toLocaleDateString('en-US', { weekday: 'short' }); }
    function isSameDay(d1, d2) { return d1.getFullYear() === d2.getFullYear() && d1.getMonth() === d2.getMonth() && d1.getDate() === d2.getDate(); }
    function getWeekNumber(d) {
        d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
        d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay()||7));
        var yearStart = new Date(Date.UTC(d.getUTCFullYear(),0,1));
        return Math.ceil((((d - yearStart) / 86400000) + 1)/7);
    }
    function showModal(modalEl) {
        document.body.classList.add('modal-open');
        modalEl.classList.remove('hidden');
        if (modalEl === twoFaModal && twoFaInput) {
            twoFaInput.value = '';
            twoFaInput.focus();
        }
    }
    function hideModal(modalEl) {
        document.body.classList.remove('modal-open');
        modalEl.classList.add('hidden');
    }
    function triggerHapticFeedback() { if (navigator.vibrate) navigator.vibrate(10); }
    function parseTime(t) {
        if (!t) return null;
        const match = t.match(/(\d{1,2}:\d{2})\s*(AM|PM)?/i);
        if (!match) return null;
        const [timePart, ampm] = match.slice(1);
        let [h, m] = timePart.split(':').map(Number);
        if (ampm && /pm/i.test(ampm) && h < 12) h += 12;
        if (ampm && /am/i.test(ampm) && h === 12) h = 0;
        const d = new Date(); d.setHours(h, m, 0, 0); return d;
    }
    function calculateHoursDuration(start, end) {
        const startTime = parseTime(start); const endTime = parseTime(end);
        if (startTime && endTime) { let diff = (endTime - startTime) / 3600000; if (diff < 0) diff += 24; return diff; }
        return 0;
    }

    function parseShifts(data) {
        const parsed = [];
        if (!data) return parsed;
        const takeHomeMultiplier = appState.takeHomePercent / 100;

        if(data.walmart?.payload?.weeks) data.walmart.payload.weeks.forEach(week => {
            week.schedules.forEach(shift => {
                const start = new Date(shift.shiftStartTime);
                const end = new Date(shift.shiftEndTime);
                const startTimeStr = start.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).replace(' ', '');
                const endTimeStr = end.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).replace(' ', '');
                const durationHours = calculateHoursDuration(startTimeStr, endTimeStr);
                const paidHours = durationHours > 5.5 ? durationHours - 1 : durationHours;
                const grossPay = paidHours * appState.payRates.walmart;
                parsed.push({
                    date: formatLocalDate(start), start: startTimeStr, end: endTimeStr, durationHours, paidHours,
                    grossPay, netPay: grossPay * takeHomeMultiplier,
                    job: shift.events?.[0]?.jobDescription || 'Walmart Shift', source: 'walmart'
                });
            });
        });

        if(Array.isArray(data.canes)) {
            data.canes.forEach(s => {
                const d = new Date();
                d.setDate(parseInt(s.day, 10));
                const [start, end] = (s.duration || '').split('-').map(p => p?.trim() || '');
                const durationHours = calculateHoursDuration(start, end);
                const grossPay = durationHours * appState.payRates.canes;
                parsed.push({
                    date: formatLocalDate(d), start: start || 'N/A', end: end || 'N/A', durationHours, paidHours: durationHours,
                    grossPay, netPay: grossPay * takeHomeMultiplier, job: s.job || "Cane's Shift", source: 'canes'
                });
            });
        }
        
        return parsed.sort((a, b) => new Date(a.date) - new Date(b.date) || parseTime(a.start) - parseTime(b.start));
    }
    
    function detectOverlaps() {
        const shiftsByDate = appState.allShifts.reduce((acc, shift) => { (acc[shift.date] = acc[shift.date] || []).push(shift); return acc; }, {});
        for (const date in shiftsByDate) {
            const dayShifts = shiftsByDate[date];
            if (dayShifts.length < 2) continue;
            for(let i = 0; i < dayShifts.length - 1; i++) {
                const currentEnd = parseTime(dayShifts[i].end); const nextStart = parseTime(dayShifts[i+1].start);
                if (currentEnd > nextStart) { dayShifts[i].hasOverlap = true; dayShifts[i+1].hasOverlap = true; }
            }
        }
    }

    function updateNextShiftTicker() {
        const now = new Date();
        const nextShift = appState.allShifts.find(shift => {
            const shiftStart = parseTime(shift.start); const shiftDate = parseYMDAsLocal(shift.date);
            if (!shiftStart || !shiftDate) return false;
            const startDateTime = new Date(shiftDate.getFullYear(), shiftDate.getMonth(), shiftDate.getDate(), shiftStart.getHours(), shiftStart.getMinutes());
            return startDateTime > now;
        });
        if (nextShift && nextShiftTickerEl) {
            const shiftStart = parseTime(nextShift.start); const shiftDate = parseYMDAsLocal(nextShift.date);
            const startDateTime = new Date(shiftDate.getFullYear(), shiftDate.getMonth(), shiftDate.getDate(), shiftStart.getHours(), shiftStart.getMinutes());
            const diffMs = startDateTime - now; const diffHours = Math.floor(diffMs / 3600000); const diffMins = Math.round((diffMs % 3600000) / 60000);
            nextShiftTickerEl.innerHTML = `Next shift (${nextShift.job}) starts in <strong>${diffHours}h ${diffMins}m</strong>.`;
            nextShiftTickerEl.style.display = 'block';
        } else if (nextShiftTickerEl) { nextShiftTickerEl.style.display = 'none'; }
    }

    function exportToCsv() {
        let csvContent = "data:text/csv;charset=utf-8,Date,Job,Start,End,Paid Hours,Gross Pay,Net Pay\n";
        appState.allShifts.forEach(shift => {
            const row = [shift.date, `"${shift.job}"`, shift.start, shift.end, shift.paidHours.toFixed(2), shift.grossPay.toFixed(2), shift.netPay.toFixed(2)].join(',');
            csvContent += row + "\n";
        });
        const encodedUri = encodeURI(csvContent); const link = document.createElement("a");
        link.setAttribute("href", encodedUri); link.setAttribute("download", "my_schedule.csv");
        document.body.appendChild(link); link.click(); document.body.removeChild(link);
    }

    function saveToLocalStorage(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
    function getFromLocalStorage(key) { const value = localStorage.getItem(key); return value ? JSON.parse(value) : null; }
    
    function saveSettings() {
        const settings = { 
            darkMode: themeToggle.checked, 
            payRates: appState.payRates, 
            takeHomePercent: appState.takeHomePercent,
            serverUrl: appState.serverUrl
        };
        saveToLocalStorage('userSettings', settings);
    }

    function loadSettings() {
        const savedSettings = getFromLocalStorage('userSettings');
        if (savedSettings) {
            appState.payRates = savedSettings.payRates || appState.payRates;
            appState.takeHomePercent = savedSettings.takeHomePercent || appState.takeHomePercent;
            themeToggle.checked = savedSettings.darkMode;
            document.body.classList.toggle('dark-mode', savedSettings.darkMode);
            appState.serverUrl = savedSettings.serverUrl || "";
        }
        serverIpInput.value = appState.serverUrl;
        walmartRateInput.value = appState.payRates.walmart || '';
        canesRateInput.value = appState.payRates.canes || '';
        takeHomePercentInput.value = appState.takeHomePercent || '0';
    }
});