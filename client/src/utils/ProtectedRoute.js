import { Navigate, Outlet } from "react-router-dom";
import { jwtDecode } from "jwt-decode";

const ProtectedRoute = () => {
  const token = localStorage.getItem("token");

  if (!token) return <Navigate to="/login" />;

  try {
    const decoded = jwtDecode(token);
    const isExpired = decoded.exp * 1000 < Date.now();

    return isExpired ? <Navigate to="/login" /> : <Outlet />;
  } catch (err) {
    return <Navigate to="/login" />;
  }
};

export default ProtectedRoute;
