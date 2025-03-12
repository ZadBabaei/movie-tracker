import React from 'react';
import "./Dashboard.css";
import Navbar from '../component/Navbar';
import Hero from '../component/Hero';
// import Badge from '../component/Badge';
// import img from '../assets/1 (40).jpg';

function Dashboard() {
  return (
    <div>
      <Navbar
        // userName={user ? user.name : "Guest"}
  ></Navbar>
      <Hero
      backgroundImage="https://image.tmdb.org/t/p/original/7ucaMpXAmlIM24qZZ8uI9hCY0hm.jpg"></Hero>
   </div>
  );
}

export default Dashboard;
