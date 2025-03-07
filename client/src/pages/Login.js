import React, { useState } from 'react';
import axios from 'axios';
import { useNavigate, Link } from 'react-router-dom';
import './Login.css';

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
      <h2 className='login-text'>Login</h2>
      {error && <p className="error-message">{error}</p>} {/* ✅ Display error */}
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
  );
}

export default Login;
