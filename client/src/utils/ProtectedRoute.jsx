import { Navigate, Outlet } from "react-router-dom";
import { jwtDecode } from "jwt-decode";

const ProtectedRoute = () => {
  const token = localStorage.getItem("token");

  if (!token) return <Navigate to="/" />;

  try {
    const decoded = jwtDecode(token);
    const isExpired = decoded.exp * 1000 < Date.now();

    return isExpired ? <Navigate to="/" /> : <Outlet />;
  } catch (err) {
    return <Navigate to="/" />;
  }
};

export default ProtectedRoute;
