import React from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import Dashboard from "./pages/Dashboard";
import Home from "./pages/Home";
import Inbox from "./pages/inbox";
// import MovieGroupsDropdown from "./components/MovieGroupsDropdown";
import GroupPage from "./pages/GroupPage";


function App() {
	return (
		<Router>
			<Routes>
				<Route path="/" element={<Login />} />
				<Route path="/signup" element={<Signup />} />
				<Route path="/home" element={<Home />} />
				<Route path="/dashboard" element={<Dashboard />} />
				<Route path="/inbox" element={<Inbox />} />
				<Route path="/group/:id" element={<GroupPage />} />
			</Routes>
		</Router>
	);
}

export default App;
