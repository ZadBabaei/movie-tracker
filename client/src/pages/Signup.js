import React, { useState } from "react";
import axios from "axios";
import { useNavigate, Link } from "react-router-dom";
import "./Signup.css";

function Signup() {
	const [name, setName] = useState("");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const navigate = useNavigate();
	const API_URL = process.env.REACT_APP_API_URL;

	const handleSubmit = async (e) => {
		e.preventDefault();
		try {
			await axios.post(`${API_URL}/api/user/login`, { name, email, password });
			alert("✅ Signup successful! You can now log in.");
			navigate("/");
		} catch (error) {
			alert("❌ Signup failed. Maybe the user already exists.");
		}
	};

	return (
		<div className="auth-container">
			<div className="auth-wrapper">
				<h2 className="auth-title">Signup</h2>
				<form onSubmit={handleSubmit}>
					<input
						type="text"
						className="auth-input"
						placeholder="Name"
						value={name}
						onChange={(e) => setName(e.target.value)}
						required
					/>
					<input
						type="email"
						className="auth-input"
						placeholder="Email"
						value={email}
						onChange={(e) => setEmail(e.target.value)}
						required
					/>
					<input
						type="password"
						className="auth-input"
						placeholder="Password"
						value={password}
						onChange={(e) => setPassword(e.target.value)}
						required
					/>
					<button type="submit" className="auth-button">
						Sign Up
					</button>
				</form>
				<p className="auth-switch">
					Already have an account? <Link to="/">Login</Link>
				</p>
			</div>
		</div>
	);
}

export default Signup;
