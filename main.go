package main

import (
	"encoding/json"
	"net/http"
	"os"
	"strconv"
	"sync"
)

type Task struct {
	ID        int    `json:"id"`
	Title     string `json:"title"`
	Completed bool   `json:"completed"`
	Priority  string `json:"priority"`
	Deadline  string `json:"deadline"`
	StartTime string `json:"start_time"`
	EndTime   string `json:"end_time"`
	Status    string `json:"status"`
}

const dbFileName = "tasks.json"

var (
	tasks  = []Task{}
	nextID = 1
	mu     sync.Mutex
)

func saveTasksToFile() {
	data, err := json.MarshalIndent(tasks, "", "  ")
	if err != nil {
		println("Ошибка сериализации JSON:", err.Error())
		return
	}
	err = os.WriteFile(dbFileName, data, 0644)
	if err != nil {
		println("Ошибка записи в файл:", err.Error())
	}
}

func loadTasksFromFile() {
	// Проверяем, существует ли файл
	if _, err := os.Stat(dbFileName); os.IsNotExist(err) {
		println("Файл базы данных не найден, будет создан новый при сохранении.")
		return
	}

	data, err := os.ReadFile(dbFileName)
	if err != nil {
		println("Ошибка чтения файла:", err.Error())
		return
	}

	err = json.Unmarshal(data, &tasks)
	if err != nil {
		println("Ошибка десериализации JSON:", err.Error())
		return
	}

	for _, t := range tasks {
		if t.ID >= nextID {
			nextID = t.ID + 1
		}
	}
	println("Задачи успешно загружены из файла. Количество:", len(tasks))
}

func main() {

	loadTasksFromFile()

	fs := http.FileServer(http.Dir("./static"))
	http.Handle("/", fs)

	http.HandleFunc("/api/tasks", tasksHandler)
	http.HandleFunc("/api/tasks/toggle", toggleTaskHandler)
	http.HandleFunc("/api/tasks/delete", deleteTaskHandler)
	http.HandleFunc("/api/tasks/update-status", updateStatusHandler)

	println("Сервер запущен на http://localhost:8080")
	http.ListenAndServe(":8080", nil)
}

func tasksHandler(w http.ResponseWriter, r *http.Request) {
	mu.Lock()
	defer mu.Unlock()
	w.Header().Set("Content-Type", "application/json")

	if r.Method == http.MethodGet {
		json.NewEncoder(w).Encode(tasks)
		return
	}

	if r.Method == http.MethodPost {
		var t Task
		if err := json.NewDecoder(r.Body).Decode(&t); err == nil {
			t.ID = nextID
			nextID++
			if t.Status == "" {
				t.Status = "todo"
			}
			tasks = append(tasks, t)

			// Сохраняем изменения в файл
			saveTasksToFile()

			json.NewEncoder(w).Encode(t)
		}
	}
}

func toggleTaskHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodPost {
		id, _ := strconv.Atoi(r.URL.Query().Get("id"))
		mu.Lock()
		defer mu.Unlock()
		for i, t := range tasks {
			if t.ID == id {
				tasks[i].Completed = !tasks[i].Completed
				tasks[i].Status = map[bool]string{true: "done", false: "todo"}[tasks[i].Completed]
				break
			}
		}
		// Сохраняем изменения в файл
		saveTasksToFile()
		w.WriteHeader(http.StatusOK)
	}
}

func deleteTaskHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodDelete {
		id, _ := strconv.Atoi(r.URL.Query().Get("id"))
		mu.Lock()
		defer mu.Unlock()
		for i, t := range tasks {
			if t.ID == id {
				tasks = append(tasks[:i], tasks[i+1:]...)
				break
			}
		}
		// Сохраняем изменения в файл
		saveTasksToFile()
		w.WriteHeader(http.StatusOK)
	}
}

func updateStatusHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodPost {
		id, _ := strconv.Atoi(r.URL.Query().Get("id"))
		status := r.URL.Query().Get("status")
		mu.Lock()
		defer mu.Unlock()
		for i, t := range tasks {
			if t.ID == id {
				tasks[i].Status = status
				tasks[i].Completed = (status == "done")
				break
			}
		}
		// Сохраняем изменения в файл
		saveTasksToFile()
		w.WriteHeader(http.StatusOK)
	}

}
