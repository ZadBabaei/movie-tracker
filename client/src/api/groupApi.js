import axios from "axios";

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
