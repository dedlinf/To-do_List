let allTasks = [];
let currentView = 'kanban';
let searchQuery = '';
let selectedDateFilter = '2026-07-06'; // Системная дата по умолчанию


let calendarCurrentDate = new Date(2026, 6, 6); // Июль 2026 года
let pomodoroInterval = null;
let pomodoroTimeLeft = 25 * 60;

document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    resetModalDates();
    fetchTasks();
    renderCalendar();
});

// Запрос данных с сервера
async function fetchTasks() {
    try {
        const res = await fetch('/api/tasks');
        allTasks = await res.json() || [];
        renderViews();
    } catch (err) {
        console.error("Ошибка загрузки задач:", err);
    }
}

// УПРАВЛЕНИЕ МОДАЛЬНЫМ ОКНОМ
function openModal() {
    document.getElementById('taskModal').style.display = 'flex';
    resetModalDates();
    document.getElementById('taskInput').focus();
}

function closeModal() {
    document.getElementById('taskModal').style.display = 'none';
    document.getElementById('taskInput').value = '';
    document.getElementById('nlpPreview').style.display = 'none';
}

function resetModalDates() {
    document.getElementById('taskDate').value = selectedDateFilter;
    document.getElementById('taskTimeStart').value = ""; 
    document.getElementById('taskTimeEnd').value = "";   
}

// ФУНКЦИЯ ДЛЯ КЛИКА ПО СЕТКЕ ВРЕМЕНИ
function openModalWithTime(dateStr, timeStr) {
    openModal();
    document.getElementById('taskDate').value = dateStr;
    document.getElementById('taskTimeStart').value = timeStr;
    
    let [h, m] = timeStr.split(':').map(Number);
    document.getElementById('taskTimeEnd').value = `${String((h + 1) % 24).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// ПАРСЕР ЕСТЕСТВЕННОГО ЯЗЫКА (NLP)
function parseNLP(inputText) {
    let title = inputText;
    let startTime = null;
    let endTime = null;
    let dateStr = null;
    let lowerInput = inputText.toLowerCase();

    let targetDate = new Date(2026, 6, 6); 
    if (lowerInput.includes("завтра")) {
        targetDate.setDate(targetDate.getDate() + 1);
        dateStr = targetDate.toISOString().split('T')[0];
        title = title.replace(/завтра/i, '');
    } else if (lowerInput.includes("сегодня")) {
        dateStr = targetDate.toISOString().split('T')[0];
        title = title.replace(/сегодня/i, '');
    }

    function toHHMM(str) {
        if (!str) return null;
        let h = 0, m = 0;
        if (str.includes(':')) {
            [h, m] = str.split(':').map(Number);
        } else {
            h = Number(str);
        }
        if (isNaN(h) || h < 0 || h > 23) return null;
        if (isNaN(m) || m < 0 || m > 59) m = 0;
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }

    const rangeRegex = /(?:с\s+)?(\d{1,2}(?::\d{2})?)\s*(?:утра|дня|вечера)?\s*(?:и\s+)?(?:до|по|-)\s*(\d{1,2}(?::\d{2})?)\s*(?:утра|дня|вечера)?/i;
    const rangeMatch = title.match(rangeRegex);

    if (rangeMatch) {
        startTime = toHHMM(rangeMatch[1]);
        endTime = toHHMM(rangeMatch[2]);
        title = title.replace(rangeMatch[0], '');
    } else {
        const singleRegex = /(?:\bв\s+)?(\d{1,2}:\d{2})\b/i;
        const singleHourRegex = /\bв\s+(\d{1,2})\s*(?:утра|дня|вечера)?\b/i;
        
        let singleMatch = title.match(singleRegex) || title.match(singleHourRegex);
        if (singleMatch) {
            startTime = toHHMM(singleMatch[1]);
            if (startTime) {
                let [h, m] = startTime.split(':').map(Number);
                endTime = `${String((h + 1) % 24).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
            }
            title = title.replace(singleMatch[0], '');
        }
    }

    title = title.replace(/\s+/g, ' ').trim();
    return { title, startTime, endTime, dateStr };
}

function parseNLPLive() {
    const input = document.getElementById('taskInput').value;
    const preview = document.getElementById('nlpPreview');
    const dateInput = document.getElementById('taskDate');
    const timeStartInput = document.getElementById('taskTimeStart');
    const timeEndInput = document.getElementById('taskTimeEnd');
    
    if (!input.trim()) {
        preview.style.display = "none";
        return;
    }

    const result = parseNLP(input);
    let detected = false;
    let infoText = "✨ Умный ввод: ";

    if (result.dateStr) {
        dateInput.value = result.dateStr;
        infoText += "📅 Дата определена. ";
        detected = true;
    }

    if (result.startTime) {
        timeStartInput.value = result.startTime;
        if (result.endTime) {
            timeEndInput.value = result.endTime;
            infoText += `🕒 Время: с ${result.startTime} до ${result.endTime}.`;
        } else {
            infoText += `🕒 Время начала: ${result.startTime}.`;
        }
        detected = true;
    }

    if (detected) {
        preview.style.display = "block";
        preview.innerHTML = infoText;
    } else {
        preview.style.display = "none";
    }
}

async function addTask() {
    const input = document.getElementById('taskInput');
    const originalValue = input.value.trim();
    if (!originalValue) return;

    const nlpResult = parseNLP(originalValue);
    const finalTitle = nlpResult.title || originalValue;

    const dateVal = document.getElementById('taskDate').value || selectedDateFilter;
    let timeStartVal = document.getElementById('taskTimeStart').value.trim() || nlpResult.startTime;
    let timeEndVal = document.getElementById('taskTimeEnd').value.trim() || nlpResult.endTime;

    if (!timeStartVal) timeStartVal = "12:00";
    if (!timeEndVal) {
        const [h, m] = timeStartVal.split(':').map(Number);
        timeEndVal = `${String((h + 1) % 24).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }

    const finalDeadline = `${dateVal} ${timeStartVal}`;

    await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            title: finalTitle,
            completed: false,
            priority: document.getElementById('prioritySelect').value,
            deadline: finalDeadline,
            end_time: timeEndVal,
            status: "todo"
        })
    });

    closeModal();
    fetchTasks();
}

async function updateStatus(id, newStatus) {
    await fetch(`/api/tasks/update-status?id=${id}&status=${newStatus}`, { method: 'POST' });
    fetchTasks();
}

async function toggleTask(id) {
    await fetch(`/api/tasks/toggle?id=${id}`, { method: 'POST' });
    fetchTasks();
}

async function deleteTask(id) {
    await fetch(`/api/tasks/delete?id=${id}`, { method: 'DELETE' });
    fetchTasks();
}

function handleSearch() {
    searchQuery = document.getElementById('searchInput').value.toLowerCase();
    renderViews();
}

function switchView(viewName) {
    currentView = viewName;
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    
    const activeTab = document.getElementById(`tab-${viewName}`);
    if (activeTab) activeTab.classList.add('active');

    document.getElementById('listView').style.display = viewName === 'list' ? 'block' : 'none';
    document.getElementById('kanbanView').style.display = viewName === 'kanban' ? 'block' : 'none';
    document.getElementById('dayView').style.display = viewName === 'day' ? 'block' : 'none';
    document.getElementById('pomodoroView').style.display = viewName === 'pomodoro' ? 'block' : 'none';
    
    renderViews();
}

function renderCalendar() {
    const year = calendarCurrentDate.getFullYear();
    const month = calendarCurrentDate.getMonth();

    const monthNames = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
    const titleString = `${monthNames[month]} ${year}`;
    document.getElementById('calendarMonthHeader').innerText = titleString;
    document.getElementById('miniCalTitle').innerText = titleString;

    const firstDayIndex = new Date(year, month, 1).getDay();
    const totalDays = new Date(year, month + 1, 0).getDate();
    const prevTotalDays = new Date(year, month, 0).getDate();

    const daysGrid = document.getElementById('miniCalDays');
    daysGrid.innerHTML = '';

    for (let i = firstDayIndex; i > 0; i--) {
        const div = document.createElement('div');
        div.className = 'cal-day-cell other-month';
        div.innerText = prevTotalDays - i + 1;
        daysGrid.appendChild(div);
    }

    for (let day = 1; day <= totalDays; day++) {
        const div = document.createElement('div');
        div.className = 'cal-day-cell';
        div.innerText = day;

        const currentDayStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

        if (selectedDateFilter === currentDayStr) {
            div.classList.add('selected-filter-day');
        }

        if (day === 6 && month === 6 && year === 2026) {
            div.classList.add('today-active');
        }

        div.onclick = () => {
            selectedDateFilter = currentDayStr;
            renderCalendar();
            switchView('day');
        };

        daysGrid.appendChild(div);
    }
}

function changeMonth(direction) {
    calendarCurrentDate.setMonth(calendarCurrentDate.getMonth() + direction);
    renderCalendar();
}

function setTodayFilter() {
    selectedDateFilter = "2026-07-06";
    calendarCurrentDate = new Date(2026, 6, 6);
    renderCalendar();
    switchView('day');
}

function clearDateFilter() {
    selectedDateFilter = '';
    renderCalendar();
    switchView('kanban');
}

function getRuDayName(dateObj) {
    const days = ["ВС", "ПН", "ВТ", "СР", "ЧТ", "ПТ", "СБ"];
    return days[dateObj.getDay()];
}


function renderViews() {
    const todoGrid = document.getElementById('col-todo')?.querySelector('.kanban-cards-grid');
    const progressGrid = document.getElementById('col-in_progress')?.querySelector('.kanban-cards-grid');
    const doneGrid = document.getElementById('col-done')?.querySelector('.kanban-cards-grid');
    const list = document.getElementById('taskList');
    const hourlyGrid = document.getElementById('hourlyTimelineGrid');

    if (todoGrid) todoGrid.innerHTML = '';
    if (progressGrid) progressGrid.innerHTML = '';
    if (doneGrid) doneGrid.innerHTML = '';
    if (list) list.innerHTML = '';

    const filteredTasks = allTasks.filter(task => {
        const matchesSearch = task.title.toLowerCase().includes(searchQuery);
        const matchesDate = selectedDateFilter ? task.deadline.startsWith(selectedDateFilter) : true;
        return matchesSearch && matchesDate;
    });

    
    if (hourlyGrid) {
        hourlyGrid.innerHTML = '';
        hourlyGrid.style.position = 'relative'; 
        
        const activeFilterDate = selectedDateFilter ? new Date(selectedDateFilter) : new Date(2026, 6, 6);
        const timelineDayNameEl = document.getElementById('timelineDayName');
        if (timelineDayNameEl) timelineDayNameEl.innerText = getRuDayName(activeFilterDate);
        
        const dayNumSpan = document.getElementById('timelineDayNumber');
        if (dayNumSpan) {
            dayNumSpan.innerText = activeFilterDate.getDate();
            if (selectedDateFilter === "2026-07-06") {
                dayNumSpan.classList.add('active-blue');
            } else {
                dayNumSpan.classList.remove('active-blue');
            }
        }

       
        for (let hour = 0; hour < 24; hour++) {
            const hourStr = String(hour).padStart(2, '0') + ':00';
            const row = document.createElement('div');
            row.className = 'timeline-hour-row';
            
            const label = document.createElement('div');
            label.className = 'hour-label';
            label.innerText = hour === 0 ? '' : hourStr;
            
            const slot = document.createElement('div');
            slot.className = 'hour-content-slot';
            slot.id = `hour-slot-${hour}`;
            
            const dateForEvent = selectedDateFilter || "2026-07-06";
            slot.onclick = () => openModalWithTime(dateForEvent, hourStr);

            row.appendChild(label);
            row.appendChild(slot);
            hourlyGrid.appendChild(row);
        }

        const firstSlot = document.getElementById('hour-slot-0');
        const eventsContainer = document.createElement('div');
        eventsContainer.className = 'timeline-events-holder';
        eventsContainer.style.position = 'absolute';
        eventsContainer.style.top = '0';
        if (firstSlot) {
            eventsContainer.style.left = `${firstSlot.offsetLeft}px`;
            eventsContainer.style.width = `${firstSlot.offsetWidth}px`;
        } else {
            eventsContainer.style.left = '60px';
            eventsContainer.style.width = 'calc(100% - 60px)';
        }
        eventsContainer.style.height = `${24 * 56}px`;
        eventsContainer.style.pointerEvents = 'none'; 
        hourlyGrid.appendChild(eventsContainer);

        const preparedTasks = filteredTasks.map(task => {
            const timePart = task.deadline.split(' ')[1] || "12:00";
            const [startHour, startMin] = timePart.split(':').map(Number);
            
            let endTimePart = task.end_time;
            if (!endTimePart) {
                endTimePart = `${String((startHour + 1) % 24).padStart(2, '0')}:${String(startMin).padStart(2, '0')}`;
            }
            const [endHour, endMin] = endTimePart.split(':').map(Number);

            const startMins = startHour * 60 + startMin;
            let endMins = endHour * 60 + endMin;
            if (endMins <= startMins) endMins = startMins + 60; 

            return { task, startMins, endMins, timePart, endTimePart, colIndex: 0, maxOverlapCols: 1 };
        });

        preparedTasks.sort((a, b) => a.startMins - b.startMins || (b.endMins - b.startMins) - (a.endMins - a.startMins));

        let currentCluster = [];
        let clusterEndMinutes = 0;

        preparedTasks.forEach(pt => {
            if (pt.startMins >= clusterEndMinutes && currentCluster.length > 0) {
                packGroup(currentCluster);
                currentCluster = [];
                clusterEndMinutes = 0;
            }
            currentCluster.push(pt);
            if (pt.endMins > clusterEndMinutes) {
                clusterEndMinutes = pt.endMins;
            }
        });

        if (currentCluster.length > 0) {
            packGroup(currentCluster);
        }

        function packGroup(group) {
            const columns = [];
            
            group.forEach(event => {
                let placed = false;
                for (let i = 0; i < columns.length; i++) {
                    const lastInCol = columns[i][columns[i].length - 1];
                    if (lastInCol.endMins <= event.startMins) {
                        columns[i].push(event);
                        event.colIndex = i;
                        placed = true;
                        break;
                    }
                }
                if (!placed) {
                    columns.push([event]);
                    event.colIndex = columns.length - 1;
                }
            });

            group.forEach(event => {
                event.maxOverlapCols = columns.length;
            });
        }

        preparedTasks.forEach(pt => {
            const slotHeight = 56; 
            const topOffset = (pt.startMins / 60) * slotHeight;
            const cardHeight = ((pt.endMins - pt.startMins) / 60) * slotHeight;

            const eventCard = document.createElement('div');
            eventCard.className = `timeline-event-card ${pt.task.priority}`;
            eventCard.style.position = 'absolute';
            eventCard.style.pointerEvents = 'auto'; 
            eventCard.innerHTML = `
                <span class="event-title">${pt.task.title}</span>
                <span class="event-time-badge">${pt.timePart} - ${pt.endTimePart}</span>
            `;

            eventCard.style.top = `${topOffset}px`;
            eventCard.style.height = `${cardHeight - 2}px`; 

            const widthPercent = 98 / pt.maxOverlapCols;
            const leftPercent = pt.colIndex * widthPercent;

            eventCard.style.width = `${widthPercent}%`;
            eventCard.style.left = `${leftPercent}%`;

            eventCard.onclick = (e) => {
                e.stopPropagation();
                if (confirm(`Удалить задачу "${pt.task.title}"?`)) {
                    deleteTask(pt.task.id);
                }
            };
            eventsContainer.appendChild(eventCard);
        });
    }

   
    const listTitle = document.getElementById('listTitle');
    if (listTitle) {
        listTitle.innerText = selectedDateFilter 
            ? `Задачи на день: ${selectedDateFilter}` : "Все задачи проекта";
    }

    filteredTasks.forEach(task => {
        const displayTime = task.deadline ? task.deadline.split(' ')[1] || '12:00' : '12:00';
        const displayEndTime = task.end_time ? ` - ${task.end_time}` : '';

        if (list) {
            const li = document.createElement('li');
            li.className = `task-item ${task.priority}`;
            li.innerHTML = `
                <div>
                    <input type="checkbox" ${task.completed ? 'checked' : ''} onclick="toggleTask(${task.id})">
                    <span style="${task.completed ? 'text-decoration:line-through; opacity:0.5;' : ''}">${task.title}</span>
                    <span class="task-meta">🕒 ${task.deadline.split(' ')[0]} [${displayTime}${displayEndTime}]</span>
                </div>
                <button class="icon-btn" onclick="deleteTask(${task.id})">🗑️</button>
            `;
            list.appendChild(li);
        }

        const card = document.createElement('div');
        card.className = `kanban-card ${task.priority}`;
        card.innerHTML = `
            <h4>${task.title}</h4>
            <p><span>⏰ Время: ${displayTime}${displayEndTime}</span> <span>🏷️ ${task.priority}</span></p>
            <div class="kanban-actions">
                ${task.status !== 'todo' ? `<button class="btn-mini" onclick="updateStatus(${task.id}, 'todo')">◀</button>` : ''}
                ${task.status !== 'in_progress' ? `<button class="btn-mini" onclick="updateStatus(${task.id}, 'in_progress')">⏳ В процесс</button>` : ''}
                ${task.status !== 'done' ? `<button class="btn-mini" onclick="updateStatus(${task.id}, 'done')">✅ Готово</button>` : ''}
                <button class="btn-mini" style="color:#ff453a; border-color:rgba(255,69,58,0.3)" onclick="deleteTask(${task.id})">❌</button>
            </div>
        `;

        if (task.status === 'todo' && todoGrid) todoGrid.appendChild(card);
        if (task.status === 'in_progress' && progressGrid) progressGrid.appendChild(card);
        if (task.status === 'done' && doneGrid) doneGrid.appendChild(card);
    });
}


function initTheme() {
    const savedTheme = localStorage.getItem('theme') || 'dark-theme';
    document.body.className = savedTheme;
}

function toggleTheme() {
    if (document.body.classList.contains('dark-theme')) {
        document.body.className = 'light-theme';
        localStorage.setItem('theme', 'light-theme');
    } else {
        document.body.className = 'dark-theme';
        localStorage.setItem('theme', 'dark-theme');
    }
}


function togglePomodoro() {
    const btn = document.getElementById('startTimerBtn');
    if (pomodoroInterval) {
        clearInterval(pomodoroInterval);
        pomodoroInterval = null;
        btn.innerText = "Старт";
    } else {
        btn.innerText = "Пауза";
        pomodoroInterval = setInterval(() => {
            pomodoroTimeLeft--;
            const mins = Math.floor(pomodoroTimeLeft / 60).toString().padStart(2, '0');
            const secs = (pomodoroTimeLeft % 60).toString().padStart(2, '0');
            document.getElementById('timerDisplay').innerText = `${mins}:${secs}`;
            if (pomodoroTimeLeft <= 0) {
                clearInterval(pomodoroInterval);
                alert("Сессия фокусировки завершена!");
                resetPomodoro();
            }
        }, 1000);
    }
}

function resetPomodoro() {
    if (pomodoroInterval) {
        clearInterval(pomodoroInterval);
        pomodoroInterval = null;
    }
    pomodoroTimeLeft = 25 * 60; 
    document.getElementById('timerDisplay').innerText = "25:00";
    
    const startBtn = document.getElementById('startTimerBtn');
    if (startBtn) startBtn.innerText = "Старт";
}

// ФУНКЦИЯ ДЛЯ ЭКСПОРТА (БЭКАПА) ЗАДАЧ
function exportData() {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(allTasks, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "edutask_backup.json");
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
}