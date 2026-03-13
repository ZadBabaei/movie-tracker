import axios from "axios";
import apiClient from "./apiClient";

export const fetchMyGroups = async () => {
  const token = localStorage.getItem("token");
  const res = await axios.get("http://localhost:5000/api/groups/mine", {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.data;
};

export const leaveGroup = async (groupId) => {
  const token = localStorage.getItem("token");
  await axios.post(
    `http://localhost:5000/api/groups/${groupId}/leave`,
    {},
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );
};

export const generateInviteLink = async (groupId) => {
  const token = localStorage.getItem("token");
  const res = await apiClient.post(
    `/api/groups/${groupId}/invite-link`,
    {},
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return res.data;
};

export const validateInviteLink = async (token) => {
  const res = await apiClient.get(`/api/groups/join-by-link/${token}`);
  return res.data;
};

export const joinByLink = async (token) => {
  const authToken = localStorage.getItem("token");
  const headers = authToken ? { Authorization: `Bearer ${authToken}` } : {};
  const res = await apiClient.post(`/api/groups/join-by-link/${token}`, {}, { headers });
  return res.data;
};

export const inviteByEmail = async (groupId, email, inviterName) => {
  const token = localStorage.getItem("token");
  const res = await apiClient.post(
    "/api/groups/invite-by-email",
    { groupId, email, inviterName },
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return res.data;
};

export const searchUsers = async (query) => {
  const token = localStorage.getItem("token");
  const res = await apiClient.get(`/api/user/search?q=${encodeURIComponent(query)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.data;
};
