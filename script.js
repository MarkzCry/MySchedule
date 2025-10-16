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
    const exportPdfBtn = document.getElementById('export-csv');
    const nextShiftTickerEl = document.getElementById('next-shift-ticker');
    const twoFaModal = document.getElementById('twoFaModal');
    const twoFaInput = document.getElementById('twoFaInput');
    const twoFaSubmit = document.getElementById('twoFaSubmit');
    const twoFaCancel = document.getElementById('twoFaCancel');

    const settingsBtn = document.getElementById('settingsBtn');
    const settingsModal = document.getElementById('settingsModal');
    const settingsSaveBtn = document.getElementById('settingsSave');
    const settingsCancelBtn = document.getElementById('settingsCancel');
    const walmartRateInput = document.getElementById('walmart-rate');
    const canesRateInput = document.getElementById('canes-rate');
    const takeHomePercentInput = document.getElementById('take-home-percent');
    const serverIpInput = document.getElementById('server-ip-input');

    const scheduleView = document.getElementById('schedule-view');
    const analyticsView = document.getElementById('analytics-view');
    const viewBtns = document.querySelectorAll('.view-btn');

    const earningsChartCanvas = document.getElementById('earnings-chart');
    const paycheckEstimateEl = document.getElementById('paycheck-estimate');
    let earningsChart = null;

    const pullToRefreshEl = document.getElementById('pull-to-refresh');

    // =============================
    // STATE
    // =============================
    let appState = {
        waitingForResult: false,
        allShifts: [],
        selectedDate: new Date(),
        currentFilter: 'all',
        payRates: { walmart: 16, canes: 14.25 },
        takeHomePercent: 87,
        serverUrl: "",
        currentView: 'schedule'
    };

    // =============================
    // INITIAL LOAD & SSE SETUP
    // =============================
    function initialLoad() {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('service-worker.js')
                .then(registration => console.log('Service Worker registered with scope:', registration.scope))
                .catch(error => console.error('Service Worker registration failed:', error));
        }
        loadSettings();
        loadSchedule();
        setupStatusStream();
        setInterval(updateNextShiftTicker, 60000);
        addTouchListeners();
    }

    function setupStatusStream() {
        if (!appState.serverUrl) {
            console.log("No server URL set, skipping status stream.");
            return;
        }
        
        const eventSource = new EventSource(`${appState.serverUrl}/status-stream`);

        eventSource.onmessage = function(event) {
            const data = JSON.parse(event.data);
            console.log("SSE Message:", data.message);
            if (statusEl) {
                statusEl.textContent = data.message;
            }
        };

        eventSource.onerror = function(err) {
            console.error("EventSource failed:", err);
            statusEl.textContent = "Connection to server lost. Check settings.";
            eventSource.close();
            setTimeout(setupStatusStream, 5000);
        };
    }


    async function loadSchedule() {
        // Step 1: Always load local data first for instant, offline access.
        statusEl.textContent = 'Loading saved schedule...';
        const localData = getFromLocalStorage('scheduleData');
        if (localData) {
            processAndRender(localData); // Render what we have immediately.
        } else {
            renderEmptyState(); // Or show empty if nothing's saved.
        }

        // Step 2: Try to get an update from the server in the background.
        const savedUrl = appState.serverUrl;
        if (savedUrl && savedUrl.startsWith('http')) {
            statusEl.textContent = 'Checking for updates...';
            try {
                const res = await fetch(`${savedUrl}/combined_schedule`, { cache: 'no-store' });
                if (!res.ok) throw new Error(`Server status: ${res.status}`);
                const serverData = await res.json();

                // Step 3: Check if the server data is valid before saving and updating the view.
                const serverShifts = parseShifts(serverData);
                if (serverShifts.length > 0) {
                    saveToLocalStorage('scheduleData', serverData);
                    processAndRender(serverData); // This will re-render with the new data.
                    statusEl.textContent = 'Schedule updated from server.';
                } else {
                    // If local data was already displayed, this message is more accurate.
                    if (localData) {
                         statusEl.textContent = 'Schedule is up-to-date.';
                    }
                }
            } catch (err) {
                console.warn(`Failed to fetch update: ${err.message}`);
                statusEl.textContent = 'Server offline. Using saved schedule.';
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
        // statusEl.textContent = 'Schedule loaded successfully.'; // This is handled by loadSchedule now
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
            const hasDailyOverlap = dayShifts.some(s => s.hasOverlap);

            listHTML += `
                <div id="shift-card-${dateStr}" class="shift-card ${cardClass}">
                    <div class="card-date">
                        <span class="weekday">${getShortWeekday(d)}</span>
                        <span class="day">${d.getDate()}</span>
                        ${hasDailyOverlap ? '<span class="card-overlap-badge">OVERLAP</span>' : ''}
                    </div>
                    <div class="card-details">
                        <div class="job-info-container">`;
            
            dayShifts.forEach(shift => {
                listHTML += `
                    <div class="job-info">
                        <div class="job-title">
                            ${shift.job}
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
        
        try {
            const res = await fetch(`${appState.serverUrl}/schedule`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
            const data = await res.json();

            if (data.needs2FA) {
                showModal(twoFaModal);
                return; 
            }
            
            if (data.error) throw new Error(data.error);

            // SUCCESS: We received the new schedule.
            // Now, validate it before saving.
            const newShifts = parseShifts(data);
            if (newShifts.length > 0) {
                statusEl.textContent = 'Schedule refreshed successfully!';
                saveToLocalStorage('scheduleData', data);
                processAndRender(data);
            } else {
                statusEl.textContent = 'Refreshed, but no new shifts were found.';
                // We deliberately do NOT save or clear the old data here.
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
        
        try {
            const res = await fetch(`${appState.serverUrl}/schedule`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ twoFACode: code }) });
            const data = await res.json();
            if (data.error) throw new Error(data.error);
            
            // SUCCESS: We received the new schedule after 2FA.
            // Now, validate it before saving.
            const newShifts = parseShifts(data);
            if (newShifts.length > 0) {
                statusEl.textContent = 'Schedule refreshed successfully!';
                saveToLocalStorage('scheduleData', data);
                processAndRender(data);
            } else {
                statusEl.textContent = 'Refreshed, but no new shifts were found.';
            }

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
    exportPdfBtn.addEventListener('click', () => { triggerHapticFeedback(); exportToPdf(); });
    settingsBtn.addEventListener('click', () => { triggerHapticFeedback(); showModal(settingsModal); });
    settingsCancelBtn.addEventListener('click', () => { triggerHapticFeedback(); hideModal(settingsModal); });
    
    settingsSaveBtn.addEventListener('click', () => {
        triggerHapticFeedback();
        const newUrl = serverIpInput.value.trim();
        appState.serverUrl = newUrl;
        appState.payRates.walmart = parseFloat(walmartRateInput.value) || 0;
        appState.payRates.canes = parseFloat(canesRateInput.value) || 0;
        appState.takeHomePercent = parseInt(takeHomePercentInput.value, 10) || 87;
        saveSettings();
        hideModal(settingsModal);
        setupStatusStream();
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
            const dayShifts = shiftsByDate[date].sort((a,b) => parseTime(a.start) - parseTime(b.start));
            if (dayShifts.length < 2) continue;
            for(let i = 0; i < dayShifts.length - 1; i++) {
                for (let j = i + 1; j < dayShifts.length; j++) {
                    const endI = parseTime(dayShifts[i].end);
                    const startJ = parseTime(dayShifts[j].start);
                    const startI = parseTime(dayShifts[i].start);
                    const endJ = parseTime(dayShifts[j].end);

                    if (startI < endJ && endI > startJ) {
                        dayShifts[i].hasOverlap = true;
                        dayShifts[j].hasOverlap = true;
                    }
                }
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

    function exportToPdf() {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: 'landscape' });

        const date = appState.selectedDate;
        const year = date.getFullYear();
        const month = date.getMonth();
        const monthName = date.toLocaleString('default', { month: 'long' });

        // --- Get shifts for the current month ---
        const shiftsInMonth = appState.allShifts.filter(s => {
            const d = parseYMDAsLocal(s.date);
            return d.getFullYear() === year && d.getMonth() === month;
        });

        const shiftsByDay = shiftsInMonth.reduce((acc, shift) => {
            (acc[shift.date] = acc[shift.date] || []).push(shift);
            return acc;
        }, {});

        // --- PDF Styling & Layout Variables ---
        const pageW = doc.internal.pageSize.getWidth();
        const pageH = doc.internal.pageSize.getHeight();
        const margin = 10;
        const cellW = (pageW - margin * 2) / 7;
        const cellH = (pageH - margin * 2 - 20) / 6; // Adjusted for 6 rows
        const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        
        // --- Document Title ---
        doc.setFontSize(22);
        doc.text(`Work Schedule: ${monthName} ${year}`, pageW / 2, margin + 5, { align: 'center' });

        // --- Draw Calendar Grid & Headers ---
        doc.setFontSize(10);
        daysOfWeek.forEach((day, i) => {
            doc.text(day, margin + (i * cellW) + (cellW / 2), margin + 18, { align: 'center' });
        });

        // --- Calendar Day Cells ---
        const startOfMonth = new Date(year, month, 1);
        const endOfMonth = new Date(year, month + 1, 0);
        const totalDays = endOfMonth.getDate();
        const firstWeekday = startOfMonth.getDay();
        
        let currentDay = 1;
        for (let row = 0; row < 6; row++) {
            for (let col = 0; col < 7; col++) {
                if ((row === 0 && col < firstWeekday) || currentDay > totalDays) {
                    continue; // Skip empty cells at the start/end of the month
                }

                const x = margin + col * cellW;
                const y = margin + 22 + row * cellH;
                
                // Draw cell border
                doc.rect(x, y, cellW, cellH);

                // Draw day number
                doc.setFontSize(12).setTextColor(0, 0, 0);
                doc.text(String(currentDay), x + 2, y + 5);

                // --- Check for shifts and add them ---
                const currentDate = new Date(year, month, currentDay);
                const dateStr = formatLocalDate(currentDate);
                const dayShifts = shiftsByDay[dateStr];
                
                doc.setFontSize(8).setTextColor(100);
                if (dayShifts && dayShifts.length > 0) {
                    let yOffset = 10;
                    dayShifts.forEach(shift => {
                        if (y + yOffset < y + cellH - 2) { // Ensure text fits
                           const jobColor = shift.source === 'walmart' ? '#0284c7' : '#dc2626';
                           doc.setTextColor(jobColor);
                           doc.text(`${shift.job}: ${shift.start}-${shift.end}`, x + 2, y + yOffset, { maxWidth: cellW - 4 });
                           yOffset += 7;
                        }
                    });
                } else {
                    doc.setTextColor(150); // Lighter gray for "Day Off"
                    doc.text("Day Off", x + cellW / 2, y + cellH / 2, { align: 'center' });
                }

                currentDay++;
            }
        }
        
        doc.output('dataurlnewwindow');
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
