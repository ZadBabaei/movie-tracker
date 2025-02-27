import React, { useEffect, useState } from "react";
import axios from "axios";
import bannerImage from "../assets/hero.jpg"; 
import { useNavigate } from "react-router-dom"; 
import "./Home.css"; 
const moviePosters = [
  require("../assets/1 (1).jpg"),
  require("../assets/1 (2).jpg"),
  require("../assets/1 (3).jpg"),
  require("../assets/1 (4).jpg"),
  require("../assets/1 (5).jpg"),
  require("../assets/1 (6).jpg"),
  require("../assets/1 (7).jpg"),
  require("../assets/1 (8).jpg"),
  require("../assets/1 (9).jpg"),
  require("../assets/1 (10).jpg"),
  require("../assets/1 (11).jpg"),
  require("../assets/1 (12).jpg"),
  require("../assets/1 (13).jpg"),
  require("../assets/1 (14).jpg"),
  require("../assets/1 (15).jpg"),
  require("../assets/1 (16).jpg"),
  require("../assets/1 (17).jpg"),
  require("../assets/1 (18).jpg"),
  require("../assets/1 (19).jpg"),
  require("../assets/1 (20).jpg"),
  require("../assets/1 (21).jpg"),
  require("../assets/1 (22).jpg"),
  require("../assets/1 (23).jpg"),
  require("../assets/1 (24).jpg"),
  require("../assets/1 (25).jpg"),
  require("../assets/1 (26).jpg"),
  require("../assets/1 (27).jpg"),
  require("../assets/1 (28).jpg"),
  require("../assets/1 (29).jpg"),
  require("../assets/1 (30).jpg"),
  require("../assets/1 (31).jpg"),
  require("../assets/1 (32).jpg"),
  require("../assets/1 (33).jpg"),
  require("../assets/1 (34).jpg"),
  require("../assets/1 (35).jpg"),
  require("../assets/1 (36).jpg"),
  require("../assets/1 (37).jpg"),
  require("../assets/1 (38).jpg"),
  require("../assets/1 (39).jpg"),
  require("../assets/1 (40).jpg"),
  require("../assets/1 (41).jpg"),
  require("../assets/1 (42).jpg"),
];

function Home() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate(); 
  const [currentPoster, setCurrentPoster] = useState(moviePosters[0]);
  const [nextPoster, setNextPoster] = useState(moviePosters[1]);
  const [posterPosition, setPosterPosition] = useState({ top: "50%", left: "50%" });
  const [fade, setFade] = useState(true);

useEffect(() => {
  console.log("Fetching user data...");

  const fetchUserData = async () => {
    try {
      const token = localStorage.getItem("token");
      console.log("🔹 Token Found in LocalStorage:", token); // ✅ Debugging

      if (!token) {
        console.warn("❌ No token found. User may not be logged in.");
        setLoading(false);
        return;
      }

const res = await axios.get(`${process.env.REACT_APP_API_URL}/api/user/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      console.log("✅ API Response:", res.data); // ✅ Log API response

      if (res.data && res.data.name) {
        setUser(res.data);
      } else {
        console.warn("❌ User data received, but 'name' field is missing:", res.data);
      }
    } catch (error) {
      console.error("❌ Error fetching user data:", error);
    } finally {
      setLoading(false);
    }
  };

  fetchUserData();
}, []);





useEffect(() => {
    const changePoster = () => {
      setFade(false); // Start fading out the current poster

      setTimeout(() => {
        let randomIndex;
        do {
          randomIndex = Math.floor(Math.random() * moviePosters.length);
        } while (moviePosters[randomIndex] === currentPoster || moviePosters[randomIndex] === nextPoster);

        const randomTop = Math.floor(Math.random() * 50) + 10 + "%"; // Random vertical position (inside screen)
        const randomLeft = Math.floor(Math.random() * 70) + 10 + "%"; // Random horizontal position

        setCurrentPoster(nextPoster); // Make next poster the current one
        setNextPoster(moviePosters[randomIndex]); // Pick a new poster for the next cycle
        setPosterPosition({ top: randomTop, left: randomLeft });
        setFade(true); // Start fading in the new poster
      }, 100); // Fade duration
    };

    const interval = setInterval(changePoster, 10000); // Change poster every 10 seconds
    return () => clearInterval(interval); // Cleanup interval on component unmount
  }, [currentPoster, nextPoster]);
  
  return (
    <div className="home-container">
      {/* Hero Banner Section */}
      <div className="hero-banner">
        {/* Glassy Navbar */}
        <nav className="glassy-navbar">
          <div className="nav-left">
            <span>Welcome, {user ? user.name : "Guest"}!</span>
          </div>
          <div className="nav-right">
            <a href="#">Create Movie Group</a>
            <a href="#">Add Movie</a>
            <a href="#">Schedule Watch Session</a>
          </div>
        </nav>
         {/* Centered Text in Banner */}
        <div className="banner-text">
          <h1>Let's Watch Movies Together</h1>
        </div>

        {/* Banner Image */}
        <img src={bannerImage} alt="Movie Tracker" className="banner-image" />
      </div>
      <div className="banner-buttons">
          <button onClick={() => navigate("/movie-groups")}>Your Movie Groups</button>
          <button onClick={() => navigate("/upcoming-movies")}>Upcoming Movies</button>
          <button onClick={() => navigate("/watchlist")}>Watch List</button>
      </div>
        {/* Random Movie Posters */}
      <div className="poster-container">
        <img
          src={currentPoster}
          alt="Movie Poster"
          className={`movie-poster ${fade ? "fade-in" : "fade-out"}`}
          style={{ top: posterPosition.top, left: posterPosition.left }}
        />
        <img
          src={nextPoster}
          alt="Next Movie Poster"
          className={`movie-poster ${fade ? "fade-out" : "fade-in"}`}
          style={{ top: posterPosition.top, left: posterPosition.left }}
        />
      </div>
    </div>
  );
}

export default Home;
