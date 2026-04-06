# 🎬 Movie Tracker

**Movie Tracker** is a full-stack web application designed to make movie nights with friends easier and more collaborative. Whether you're planning your next group viewing, voting on what to watch, or simply keeping track of shared favorites, this app helps you organize and enjoy movies together — all in one place.

---

[Watch the demo video](https://streamable.com/0sbjip)

---

## 🌟 Features

### 👥 Group Management
- Create and join movie groups
- Invite friends by username
- Display total members and group stats

### 🗳️ Collaborative Movie Polls
- Suggest movies and vote as a group
- Limit voting to specific rules (e.g., max 4 picks per person)
- Display winning movie with tie-breaking logic

### 💬 Group Chat
- Real-time messaging powered by **Stream Chat API**
- Every group has its own private chat space
- Messages are scoped to the group, ensuring privacy and context

### 🎞️ Watched Movies List
- Add movies to the shared "watched" list
- View a grid of group-watched content
- Open detailed modal for movie info, vote history, and comments

### ✍️ Comments & Reactions
- Comment on specific movies inside the group
- Leave notes, reactions, or thoughts after watching

### 🔐 Role-based Permissions
- Only the group creator can remove movies from the watched list
- All users can add movies and participate in polls

---

## 💻 Technologies Used

### Frontend
- **React**
- **CSS (custom components + modular structure)**
- **React Router** for page navigation

### Backend
- **Node.js** & **Express**
- **MongoDB** with **Mongoose**
- **JWT** authentication and route protection

### Real-Time Features
- **Stream Chat API** for integrated group messaging

---

## 🧠 Project Purpose

This app was built to solve a common problem: _planning and organizing group movie nights with minimal friction._ With group chat, polls, watchlists, and availability-based features (coming soon), Movie Tracker is the ideal platform to help you and your friends pick, vote, and enjoy films — together.

---

## 📁 Folder Structure
/client → React frontend (components, pages, styles) /server → Express backend (routes, models, middleware) /context → Shared state for modals and auth


---

## ✨ Author

Created by **Zad Babaei**  
GitHub: [@mehrzad-dev](https://github.com/mehrzad-dev)
- <!-- add-to-portfolio -->

---







