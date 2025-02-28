import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { PlayIcon, FilmIcon } from "@heroicons/react/24/solid"; // ✅ Correct import for Heroicons v2
import axios from "axios";
import "./Home.css";
import movies from "../data/movies.js";

const randomPositions = [
  { top: "50%", left: "5%" },
  { top: "65%", left: "7%" },
  { top: "70%", left: "1%" },
  { top: "60%", left: "9%" },
  { top: "70%", left: "11%" },
  { top: "60%", left: "13%" },
  { top: "70%", left: "15%" },
  { top: "70%", left: "20%" },
  { top: "55%", left: "17%" },
  { top: "70%", left: "19%" },
  { top: "70%", left: "22%" },
  { top: "70%", left: "27%" },
  { top: "70%", left: "30%" },
  { top: "70%", left: "30%" },
  { top: "70%", left: "30%" },
  { top: "70%", left: "30%" },
  { top: "70%", left: "30%" },
  { top: "70%", left: "37%" },
  { top: "70%", left: "33%" },
  { top: "60%", left: "41%" },
  { top: "60%", left: "45%" },
  { top: "66%", left: "47%" },
  { top: "67%", left: "53%" },
  { top: "60%", left: "57%" },
  { top: "50%", right: "5%" },
  { top: "65%", right: "7%" },
  { top: "58%", right: "1%" },
  { top: "60%", right: "9%" },
  { top: "65%", right: "11%" },
  { top: "60%", right: "13%" },
  { top: "55%", right: "15%" },
  { top: "50%", right: "20%" },
  { top: "55%", right: "17%" },
  { top: "70%", right: "19%" },
  { top: "70%", right: "22%" },
  { top: "70%", right: "27%" },
  { top: "70%", right: "30%" }
  
];


function Home() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [currentMovieIndex, setCurrentMovieIndex] = useState(0);
  const [position, setPosition] = useState(randomPositions[0]);


  useEffect(() => {
    const fetchUserData = async () => {
      try {
        const token = localStorage.getItem("token");
        if (!token) {
          setLoading(false);
          return;
        }

        const res = await axios.get("http://localhost:5000/api/user/me", {
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



  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentMovieIndex((prevIndex) => (prevIndex + 1) % movies.length);
      setPosition(randomPositions[Math.floor(Math.random() * randomPositions.length)]);
    }, 700); // Change movie every 3 seconds

    return () => clearInterval(interval);
  }, []);

  return (
    
    <div className="home-container">

      {/* Hero Section */}
      <motion.div
        className="hero-banner"
        initial={{ opacity: 0, y: -50 }}
        whileInView={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -50 }}
        viewport={{ once: false, amount: 0.5 }}
        transition={{ duration: 3 }}
      >

      <img
        src="https://image.tmdb.org/t/p/original/7ucaMpXAmlIM24qZZ8uI9hCY0hm.jpg"
        alt="Banner"
        className="banner-image"
      />

        <div className="banner-overlay" />
        <motion.h1
          className="banner-text"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8 }}
        >
          WATCH, TRACK, AND RELIVE THE FUN!
        </motion.h1>
      </motion.div>

      {/* Navbar */}
      <div className="glassy-navbar">
        <span className="nav-left">Welcome, {user ? user.name : "Guest"}!</span>
        <div className="nav-right">
          <a href="#">Create Movie Group</a>
          <a href="#">Schedule Watch Session</a>
        </div>
      </div>

{/* Action Buttons */}
<motion.div
  className="banner-buttons"
  initial={{ opacity: 0, y: 30 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ duration: 1 }}
>
  <button>
    <PlayIcon className="button-icon" /> Your Movie Groups
  </button>
  <button>
    <FilmIcon className="button-icon" /> Upcoming Movies
  </button>
  <button>
    <FilmIcon className="button-icon" /> Watch List
  </button>
</motion.div>


  {/* Animated Movie Poster */}
      <motion.div
        key={currentMovieIndex}
        className="movie-poster"
        style={position}
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.5 }}
        transition={{ duration: 1 }}
      >
        <img src={movies[currentMovieIndex].image} alt={movies[currentMovieIndex].title} />
      </motion.div>
    </div>
  );
}

export default Home;
