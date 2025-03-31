import React, { useState, useEffect } from "react";
import axios from "axios";
import quotes from "../data/Quotes";
import "./Home.css";
import VerticalNavbar from "../component/VerticalNavbar";
import AnimatedMovie from "../component/AnimatedMovie";

function Home() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [quote, setQuote] = useState("");

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
        console.error("Error fetching user data:", error);
      } finally {
        setLoading(false);
        const randomIndex = Math.floor(Math.random() * quotes.length);
        setQuote(quotes[randomIndex]);
      }
    };

    fetchUserData();
  }, []);

  return (
    <div className="home-container">
      <VerticalNavbar />

      <div
        className="landing-banner"
        style={{
          backgroundImage: `url("https://image.tmdb.org/t/p/original/7ucaMpXAmlIM24qZZ8uI9hCY0hm.jpg")`,
        }}
      >
        <div className="landing-text">
          {user && (
            <>
              <h1 className="main-heading">Welcome, {user.name}!</h1>
              <p className="sub-heading italic text-gray-200">“{quote}”</p>
            </>
          )}
        </div>
      </div>

      <AnimatedMovie />
    </div>
  );
}

export default Home;
