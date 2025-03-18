import React, { useState } from "react";
import axios from "axios";
import "./SearchBar.css";

const SearchBar = ({ onMovieSelect }) => {
	const [query, setQuery] = useState("");
	const [results, setResults] = useState([]);
	const [loading, setLoading] = useState(false);

	const apiKey = process.env.REACT_APP_TMDB_API_KEY; // classic v3 API key
	const baseUrl = "https://api.themoviedb.org/3/search/movie";
    
	const fetchMovies = async (q) => {
		if (!q) return;
		try {
            setLoading(true);
            console.log("API KEY:", apiKey);
            console.log("BASE URL:", baseUrl);

			const res = await axios.get(
				`${baseUrl}?api_key=${apiKey}&language=en-US&include_adult=false&query=${encodeURIComponent(q)}`
			);
			console.log("TMDB response:", res.data); // debug line
			setResults(res.data.results || []);
		} catch (error) {
			console.error("API Error:", error);
		} finally {
			setLoading(false);
		}
	};

	const handleChange = (e) => {
		const newQuery = e.target.value;
		setQuery(newQuery);
		if (newQuery.length > 1) {
			fetchMovies(newQuery);
		} else {
			setResults([]);
		}
	};

	const handleSearchClick = () => {
		fetchMovies(query);
	};

	const handleSelect = (movie) => {
		onMovieSelect(movie);
		setQuery("");
		setResults([]);
	};

	return (
		<div className="search-bar">
			<div className="search-bar-input-group">
				<input type="text" placeholder="Search for a movie..." value={query} onChange={handleChange} />
				<button onClick={handleSearchClick} className="search-btn">
					{loading ? "Searching..." : "Search"}
				</button>
			</div>

			{results.length > 0 && (
				<ul className="suggestions-list">
					{results.slice(0, 5).map((movie) => (
						<li key={movie.id} onClick={() => handleSelect(movie)}>
							{movie.title} ({movie.release_date?.substring(0, 4)})
						</li>
					))}
				</ul>
			)}
		</div>
	);
};

export default SearchBar;
