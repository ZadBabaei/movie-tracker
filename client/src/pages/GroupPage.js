import React, { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import axios from "axios";
import "./GroupPage.css";
import Navbar from "../component/Navbar";
import Hero from "../component/Hero";
import SearchBar from "../component/SearchBar";
import MovieCard from "../component/MovieCard";
import HeroImage from "../assets/avang02.jpg";

const GroupPage = () => {
  const { id } = useParams();
  const [group, setGroup] = useState(null);
  const [addedMovies, setAddedMovies] = useState([]);

  useEffect(() => {
    fetchGroupDetails();
  }, [id]);

const fetchGroupDetails = async () => {
  const token = localStorage.getItem("token");
  const res = await axios.get(`http://localhost:5000/api/groups/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  setGroup(res.data);
  // Populate movies from DB
  const fetchedMovies = res.data.movies.map((m) => ({
    id: m.imdbID,
    title: m.title,
    poster_path: m.poster,
    vote_average: m.vote_average || 0, // fallback if needed
  }));
  setAddedMovies(fetchedMovies);
};


const handleMovieAdd = async (movie) => {
  const token = localStorage.getItem("token");

  // Save movie to DB
  await axios.post(
    `http://localhost:5000/api/groups/${id}/add-movie`,
    { movie },
    { headers: { Authorization: `Bearer ${token}` } }
  );

  // Optimistically add to local state
  setAddedMovies((prev) => [...prev, movie]);
};

const handleDeleteMovie = async (movieId) => {
  const token = localStorage.getItem("token");
  await axios.delete(
    `http://localhost:5000/api/groups/${id}/remove-movie/${movieId}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  setAddedMovies((prev) => prev.filter((m) => m.id !== movieId));
};

  

  if (!group) return <p>Loading group...</p>;

  return (
    <div className="group-page">
      <Navbar groupName={group.name} />
      <Hero
        backgroundImage={HeroImage}
        heroText="What we watched together so far!"
      />
      <div className="group-content">
        {/* Members */}
        <div className="group-members">
          <h1 className="group-members-title">Group Members</h1>
          <div className="group-member-card-container">
            {group.members.map((member) => (
              <div key={member._id} className="group-members-card">
                <img
                  src={member.profilePic || "https://i.pravatar.cc/100"}
                  alt={member.name}
                />
                <div className="divider"></div>
                <h2>{member.name}</h2>
              </div>
            ))}
          </div>
          <button className="group-member-btn">Invite Friends</button>
        </div>

        {/* Modular SearchBar */}
        <SearchBar onMovieSelect={handleMovieAdd} />

        {/* Movies Section */}
        <div className="added-movies-container">
          {addedMovies.map((movie) => (
            <MovieCard
              key={movie.id}
              movie={movie}
              onDelete={() => handleDeleteMovie(movie.id)}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

export default GroupPage;
