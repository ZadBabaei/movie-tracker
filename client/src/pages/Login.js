import React, { useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import "./Login.css";
import SinginImg from "../assets/signin-image.jpg";
import Box from "@mui/material/Box";
import TextField from "@mui/material/TextField";
import PasswordIcon from "@mui/icons-material/Password";
import EmailIcon from "@mui/icons-material/Email";
import FormGroup from "@mui/material/FormGroup";
import FormControlLabel from "@mui/material/FormControlLabel";
import Checkbox from "@mui/material/Checkbox";
import GoogleIcon from "@mui/icons-material/Google";
import FacebookIcon from "@mui/icons-material/Facebook";
import XIcon from "@mui/icons-material/X";

function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const navigate = useNavigate();
  const API_URL = process.env.REACT_APP_API_URL;

  const handleLogin = async () => {
    try {
      const res = await axios.post(
        `${API_URL}/api/user/login`,
        { email, password },
        { headers: { "Content-Type": "application/json" } }
      );

      localStorage.setItem("token", res.data.token);
      navigate("/home");
    } catch (error) {
      setError(
        error.response?.data?.message ||
          "❌ Invalid credentials. Please try again."
      );
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    await handleLogin();
  };

  return (
    <div className="wrapper">
      <div className="left-side">
        <img className="left-side-img" src={SinginImg} alt="Sign In" />
        <h4 onClick={() => navigate("/signup")}>Create an account</h4>
      </div>
      <div className="right-side">
        <h1>Sign In</h1>
        <form onSubmit={handleSubmit}>
          <Box sx={{ "& > :not(style)": { m: 1 } }}>
            <Box sx={{ display: "flex", alignItems: "flex-end" }}>
              <EmailIcon sx={{ color: "action.active", mr: 1, my: 0.5 }} />
              <TextField
                label="E-mail"
                variant="standard"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Box>
          </Box>
          <Box sx={{ "& > :not(style)": { m: 1 } }}>
            <Box sx={{ display: "flex", alignItems: "flex-end" }}>
              <PasswordIcon sx={{ color: "action.active", mr: 1, my: 0.5 }} />
              <TextField
                label="Password"
                variant="standard"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Box>
          </Box>
          <FormGroup>
            <FormControlLabel control={<Checkbox />} label="Remember me" />
          </FormGroup>
          {error && <p className="error">{error}</p>}
          <button className="rights-side-btn" type="submit">
            Login
          </button>
        </form>
        <div className="other-logging-type">
          <h4>Or login with:</h4>
          <GoogleIcon />
          <FacebookIcon />
          <XIcon />
        </div>
      </div>
    </div>
  );
}

export default Login;
