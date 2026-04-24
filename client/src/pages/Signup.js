import React, { useState } from "react";
import axios from "axios";
import { useNavigate, Link } from "react-router-dom";
import signupImg from "../assets/signup-image.jpg";
import LogoPM from "../assets/Logo PM.png";
import Box from "@mui/material/Box";
import TextField from "@mui/material/TextField";
import EmailIcon from "@mui/icons-material/Email";
import FormGroup from "@mui/material/FormGroup";
import FormControlLabel from "@mui/material/FormControlLabel";
import Checkbox from "@mui/material/Checkbox";

import PersonIcon from "@mui/icons-material/Person";
import HttpsIcon from "@mui/icons-material/Https";
import HttpsOutlinedIcon from "@mui/icons-material/HttpsOutlined";
import Visibility from "@mui/icons-material/Visibility";
import VisibilityOff from "@mui/icons-material/VisibilityOff";
import InputAdornment from "@mui/material/InputAdornment";
import IconButton from "@mui/material/IconButton";
import "./Signup.css";

function Signup() {
	const [name, setName] = useState("");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [repeatPassword, setRepeatPassword] = useState("");
	const [error, setError] = useState(null);
	const [showPassword, setShowPassword] = useState(false);
	const [showRepeatPassword, setShowRepeatPassword] = useState(false);
	const navigate = useNavigate();
	const API_URL = process.env.REACT_APP_API_URL;

	const handleSubmit = async (e) => {
		e.preventDefault();
		setError(null);
		if (password !== repeatPassword) {
			setError(" Passwords do not match.");
			return;
		}
		try {
			await axios.post(`${API_URL}/api/auth/register`, {
				name,
				email,
				password,
			});

			// Auto-login after signup
			try {
				const loginRes = await axios.post(`${API_URL}/api/auth/login`, { email, password });
				localStorage.setItem("token", loginRes.data.token);
				const redirect = sessionStorage.getItem("redirectAfterAuth");
				if (redirect) {
					sessionStorage.removeItem("redirectAfterAuth");
					navigate(redirect);
				} else {
					navigate("/home");
				}
				return;
			} catch {
				// If auto-login fails, fall back to login page
			}

			alert(" Signup successful! You can now log in.");
			navigate("/");
		} catch (error) {
			setError(error.response?.data?.msg || " Signup failed. Maybe the user already exists.");
		}
	};

	return (
    <div className="signup-wrapper">
      <div className="left-side">
        <div className="brand-header">
          <h1 className="brand-title">Sign Up</h1>
        </div>
        <form onSubmit={handleSubmit}>
          <Box sx={{ "& > :not(style)": { m: 1 } }}>
            <Box sx={{ display: "flex", alignItems: "flex-end" }}>
              <PersonIcon
                sx={{ color: "action.active", mr: 1, my: 1, fontSize: 20 }}
              />
              <TextField
                label="Name"
                variant="standard"
                value={name}
                onChange={(e) => setName(e.target.value)}
                sx={{ width: "250px" }}
                InputProps={{ sx: { fontSize: "15px" } }}
                InputLabelProps={{ sx: { fontSize: "14px" } }}
              />
            </Box>
          </Box>
          <Box sx={{ "& > :not(style)": { m: 1 } }}>
            <Box sx={{ display: "flex", alignItems: "flex-end" }}>
              <EmailIcon
                sx={{ color: "action.active", mr: 1, my: 1, fontSize: 20 }}
              />
              <TextField
                label="E-mail"
                variant="standard"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                sx={{ width: "250px" }}
                InputProps={{ sx: { fontSize: "15px" } }}
                InputLabelProps={{ sx: { fontSize: "14px" } }}
              />
            </Box>
          </Box>
          <Box sx={{ "& > :not(style)": { m: 1 } }}>
            <Box sx={{ display: "flex", alignItems: "flex-end" }}>
              <HttpsIcon
                sx={{ color: "action.active", mr: 1, my: 1, fontSize: 20 }}
              />
              <TextField
                label="Password"
                variant="standard"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                sx={{ width: "250px" }}
                InputProps={{
                  sx: { fontSize: "15px" },
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        onClick={() => setShowPassword(!showPassword)}
                        edge="end"
                        size="small"
                      >
                        {showPassword ? <VisibilityOff sx={{ fontSize: 18 }} /> : <Visibility sx={{ fontSize: 18 }} />}
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
                InputLabelProps={{ sx: { fontSize: "14px" } }}
              />
            </Box>
          </Box>
          <Box sx={{ "& > :not(style)": { m: 1 } }}>
            <Box sx={{ display: "flex", alignItems: "flex-end" }}>
              <HttpsOutlinedIcon
                sx={{ color: "action.active", mr: 1, my: 1, fontSize: 20 }}
              />
              <TextField
                label="Repeat Password"
                variant="standard"
                type={showRepeatPassword ? "text" : "password"}
                value={repeatPassword}
                onChange={(e) => setRepeatPassword(e.target.value)}
                sx={{ width: "250px" }}
                InputProps={{
                  sx: { fontSize: "15px" },
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        onClick={() => setShowRepeatPassword(!showRepeatPassword)}
                        edge="end"
                        size="small"
                      >
                        {showRepeatPassword ? <VisibilityOff sx={{ fontSize: 18 }} /> : <Visibility sx={{ fontSize: 18 }} />}
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
                InputLabelProps={{ sx: { fontSize: "14px" } }}
              />
            </Box>
          </Box>
          <FormGroup>
            <FormControlLabel
              control={<Checkbox />}
              label={<span>I agree to all statements in <Link to="/terms" target="_blank" style={{ color: "#007bff" }}>Terms of Service</Link></span>}
              sx={{ "& .MuiTypography-root": { fontSize: "12px" } }}
            />
          </FormGroup>
          {error && <p className="error">{error}</p>}
          <button className="left-side-btn" type="submit">
            Submit
          </button>
        </form>
      </div>
      <div className="right-side">
        <img className="right-side-img" src={signupImg} alt="Sign Up" />
        <button className="auth-link-btn" onClick={() => navigate("/")}>
          Already have an account?
        </button>
      </div>
    </div>
  );
}

export default Signup;
