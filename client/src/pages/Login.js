import React, { useState } from 'react';
import axios from 'axios';
import { useNavigate, Link } from 'react-router-dom';
import './Login.css';
import SinginImg from "../assets/signin-image.jpg";

function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null); // ✅ Added Error State
  const navigate = useNavigate();
  const API_URL = process.env.REACT_APP_API_URL;

  const handleLogin = async () => {
    try {
      const res = await axios.post(`${API_URL}/api/user/login`,
 
        { email, password }, 
        { headers: { "Content-Type": "application/json" } } 
      );

      localStorage.setItem("token", res.data.token);
      navigate('/home'); 
    } catch (error) {
      setError("❌ Invalid credentials. Please try again."); // ✅ Show error on UI
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null); // ✅ Reset error before retrying
    await handleLogin();
  };

  return (
    <div className="wrapper">
      <div className="left-side">
        <img  className="left-side-img" src={SinginImg} alt="" />
        <h4>Create an account</h4>
      </div>
      <div className="right-side">
        <h1>SignIn</h1>
        <form onSubmit={handleSubmit}>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <input type="checkbox" id="rememberMe" />
          <label htmlFor="rememberMe">Remember Me</label>
          {error && <p className="error">{error}</p>}
          <button type="submit">Login</button>
        </form>
        <div className="other-logging-type">
          <h4> or loggin with</h4>
          <img src="" alt="" /><img src="" alt="" /><img src="" alt="" />
      </div>
      </div>
    </div>
  );
}

export default Login;
