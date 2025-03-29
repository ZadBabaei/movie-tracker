import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import axios from "axios";
import "./Home.css";
import AnimatedMovie from "../component/AnimatedMovie";
import VerticalNavbar from "../component/VerticalNavbar";
import GroupsModal from '../component/GroupsModal'; // adjust path if needed


import Navbar from "../component/Navbar";
import Hero from "../component/Hero";

function Home() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
const [showGroupsModal, setShowGroupsModal] = useState(false);
const [groupList, setGroupList] = useState([]);



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

useEffect(() => {
  const fetchGroups = async () => {
    try {
      const token = localStorage.getItem("token");
      const res = await axios.get("http://localhost:5000/api/groups/mine", {
        headers: { Authorization: `Bearer ${token}` },
      });
      setGroupList(res.data);
    } catch (error) {
      console.error(
        "❌ Error fetching groups:",
        error.response?.data?.msg || error.message
      );
    }
  };

  if (showGroupsModal) fetchGroups();
}, [showGroupsModal]);

  return (
    <div className="home-container">
      <VerticalNavbar onGroupsClick={() => setShowGroupsModal(true)} />

      <div
        className="landing-banner"
        style={{
          backgroundImage: `url("https://image.tmdb.org/t/p/original/7ucaMpXAmlIM24qZZ8uI9hCY0hm.jpg")`,
        }}
      >
        <div className="landing-text">
          <h1 className="main-heading">MOVIE TRACKER</h1>
          <p className="sub-heading">
            Experience movies the way they were meant to be — together.
          </p>
        </div>
      </div>

      <AnimatedMovie />
      <GroupsModal
        isOpen={showGroupsModal}
        onClose={() => setShowGroupsModal(false)}
        groups={groupList}
        onCreateGroup={() => {
          setShowGroupsModal(false);
          // You can route to group creation or open another modal
        }}
        onShowAll={() => {
          setShowGroupsModal(false);
          window.location.href = "/all-groups";
        }}
      />
    </div>
  );

}

export default Home;
