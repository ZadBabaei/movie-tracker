import React from 'react';
import "./Dashboard.css";

import Hero from '../component/Hero';
import MovieCard from '../component/MovieCard';


function Dashboard() {
  return (
    <div>
      <Hero height="34vh" eyebrow="Overview" heroText="Dashboard" heroTextSub="A quick snapshot of what's trending." />
      <MovieCard />
    </div>
  );
}

export default Dashboard;
