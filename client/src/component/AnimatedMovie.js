import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import movies from "../data/movies";

const randomPositions = [
  { top: "30%", left: "5%" },
  { top: "45%", left: "7%" },
  { top: "45%", left: "1%" },
  { top: "55%", left: "9%" },
  { top: "53%", left: "11%" },
  { top: "33%", left: "13%" },
  { top: "55%", left: "15%" },
  { top: "55%", left: "20%" },
  { top: "50%", left: "17%" },
  { top: "37%", left: "19%" },
  { top: "50%", left: "22%" },
  { top: "430%", left: "27%" },
  { top: "55%", left: "30%" },
  { top: "55%", left: "30%" },
  { top: "57%", left: "30%" },
  { top: "45%", left: "30%" },
  { top: "47%", left: "30%" },
  { top: "55%", left: "37%" },
  { top: "55%", left: "33%" },
  { top: "55%", left: "41%" },
  { top: "37%", left: "45%" },
  { top: "55%", left: "47%" },
  { top: "55%", left: "53%" },
  { top: "55%", left: "57%" },
  { top: "50%", right: "5%" },
  { top: "55%", right: "7%" },
  { top: "58%", right: "1%" },
  { top: "55%", right: "9%" },
  { top: "33%", right: "11%" },
  { top: "50%", right: "13%" },
  { top: "58%", right: "15%" },
  { top: "48%", right: "20%" },
  { top: "55%", right: "17%" },
  { top: "53%", right: "19%" },
  { top: "44%", right: "22%" },
  { top: "55%", right: "27%" },
  { top: "50%", right: "30%" }
  
];

const AnimatedMovie = () => {
  const [currentMovieIndex, setCurrentMovieIndex] = useState(0);
  const [position, setPosition] = useState(randomPositions[0]);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentMovieIndex((prevIndex) => (prevIndex + 1) % movies.length);
      setPosition(randomPositions[Math.floor(Math.random() * randomPositions.length)]);
    }, 1000); // Change movie every 3 seconds

    return () => clearInterval(interval);
  }, []);

  return (
    <motion.div
      key={currentMovieIndex}
      className="movie-poster"
      style={position}
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 0.9 }}
      exit={{ opacity: 0, scale: 0.5 }}
      transition={{ duration: 1 }}
    >
      <img src={movies[currentMovieIndex].image} alt={movies[currentMovieIndex].title} />
    </motion.div>
  );
};

export default AnimatedMovie;
