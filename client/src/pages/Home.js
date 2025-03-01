import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { PlayIcon, FilmIcon } from "@heroicons/react/24/solid"; // ✅ Correct import for Heroicons v2
import axios from "axios";
import "./Home.css";
import AnimatedMovie from "../component/AnimatedMovie";
import HeroNavbar from "../component/HeroNavbar";






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



  return (
    
    <div className="home-container">

     <HeroNavbar />


{/* Action Buttons */}
<motion.div
  className="banner-buttons"
  initial={{ opacity: 0, y: 30 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ duration: 1 }}
>
  <button>
    <PlayIcon className="button-icon" />  Movie Groups
  </button>
  <button>
    <FilmIcon className="button-icon" /> Upcoming Movies
  </button>
  <button>
    <FilmIcon className="button-icon" /> Watch List
  </button>
</motion.div>


  {/* Animated Movie Poster */}
  <AnimatedMovie />
    </div>
  );
}

export default Home;
