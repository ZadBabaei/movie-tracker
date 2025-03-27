import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
// import { PlayIcon, FilmIcon } from "@heroicons/react/24/solid"; // ✅ Correct import for Heroicons v2
import axios from "axios";
import "./Home.css";
import AnimatedMovie from "../component/AnimatedMovie";
import Hero from "../component/Hero";
import Navbar from "../component/Navbar";
// import MovieGroupsDropdown from "../component/MovieGroupsDropdown"; // ✅ New Component


function Home() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [currentMovieIndex, setCurrentMovieIndex] = useState(0);
 
 

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
      <Navbar userName={user ? user.name : "Guest"}></Navbar>
      <Hero
        backgroundImage="https://image.tmdb.org/t/p/original/7ucaMpXAmlIM24qZZ8uI9hCY0hm.jpg"
        height="100vh"
      ></Hero>
      <div className="landing-text">
        <h1 className="main-heading">MOVIE TRACKER</h1>
        <p className="sub-heading">
          Experience movies the way they were meant to be — together.
        </p>
      </div>

      {/* Action Buttons */}
      <motion.div
        className="banner-buttons"
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1 }}
      ></motion.div>

      {/* Animated Movie Poster */}
      <AnimatedMovie />
    </div>
  );
}

export default Home;
