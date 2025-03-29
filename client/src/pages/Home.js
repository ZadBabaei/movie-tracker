import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import axios from "axios";
import "./Home.css";
import AnimatedMovie from "../component/AnimatedMovie";
import VerticalNavbar from "../component/VerticalNavbar";

import Navbar from "../component/Navbar";
import Hero from "../component/Hero";

function Home() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchUserData = async () => {
      try {
        const token = localStorage.getItem("token");
        if (!token) {
          setLoading(false);
          return;
        }
        const res = await axios.get("http://localhost:5000/api/auth/me", {
          headers: { Authorization: `Bearer ${token}` },
        });
        setUser(res.data);
      } catch (error) {
        console.error("❌ Error fetching user data:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchUserData();
  }, []);

  return (
  <div className="home-container">
   
<VerticalNavbar></VerticalNavbar>
    <div
      className="landing-banner"
      style={{
        backgroundImage: `url("https://image.tmdb.org/t/p/original/7ucaMpXAmlIM24qZZ8uI9hCY0hm.jpg")`,
      }}
    >
      <div className="landing-text">
        <h1 className="main-heading">MOVIE TRACKER</h1>
        <p className="sub-heading">
          Experience movies the way they were meant to be — together.
        </p>
      </div>
    </div>

    <AnimatedMovie />
  </div>
);

}

export default Home;
