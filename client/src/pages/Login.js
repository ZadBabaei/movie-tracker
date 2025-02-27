import React, { useState } from 'react';
import axios from 'axios';
import { useNavigate, Link } from 'react-router-dom';
import './Login.css';

function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const navigate = useNavigate();
  const handleLogin = async () => {
  try {
    const res = await axios.post("http://localhost:5000/api/auth/login", { email, password });

    console.log("✅ Login Response:", res.data); // ✅ Debugging log

    if (res.data.token) {
      localStorage.setItem("token", res.data.token); // ✅ Store token
      console.log("✅ Token Stored:", localStorage.getItem("token"));
      window.location.reload(); // ✅ Refresh to fetch user data
    } else {
      console.error("❌ Login successful, but no token received.");
    }
  } catch (error) {
    console.error("❌ Login failed:", error);
  }
};


  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const res = await axios.post('/api/auth/login', { email, password });
      // Save token (you can use localStorage or sessionStorage)
      localStorage.setItem('token', res.data.token);
      navigate('/dashboard');
    } catch (error) {
      alert('Invalid credentials');
    }
  };

  return (
    <div>
      <div className="wrapper">
  <h2 className='login-text'>Login</h2>
      <form onSubmit={handleSubmit}>
        <input 
          type="email" 
          placeholder="Email" 
          value={email} 
          onChange={e => setEmail(e.target.value)}
          required
        />
        <input 
          type="password" 
          placeholder="Password" 
          value={password} 
          onChange={e => setPassword(e.target.value)}
          required
        />
        <button type="submit">Login</button>
      </form>
      <p>
        Don’t have an account? <Link to="/signup">Sign up</Link>
      </p>
      </div>
    
    </div>
  );
}

export default Login;
