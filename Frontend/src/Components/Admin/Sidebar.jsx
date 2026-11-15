import { NavLink } from "react-router-dom";
import { useEffect, useState } from "react";
import {
  FaHotel,
  FaBed,
  FaUtensils,
  FaGlassCheers,
  FaUsers,
  FaChartLine,
  FaBoxOpen,
  FaUserCircle,
  FaReceipt,
} from "react-icons/fa";
import "./Sidebar.css";

const Sidebar = () => {
  const [admin, setAdmin] = useState({ name: "Admin", email: "" });

  useEffect(() => {
    try {
      const storedAdmin = JSON.parse(localStorage.getItem("user") || "null");
      if (storedAdmin) {
        setAdmin({
          name: storedAdmin.fullname || storedAdmin.name || storedAdmin.email || "Admin",
          email: storedAdmin.email || "—"
        });
      }
    } catch {
      setAdmin({ name: "Admin", email: "—" });
    }
  }, []);

  const menuItems = [
    { name: "Dashboard", link: "/admin/dashboard", icon: <FaChartLine /> },
    { name: "Registered Users", link: "/admin/users", icon: <FaUsers /> },
    { name: "Rooms", link: "/admin/room", icon: <FaBed /> },
    { name: "Dining", link: "/admin/dining", icon: <FaUtensils /> },
    { name: "Redbox", link: "/admin/redbox", icon: <FaBoxOpen /> },
    { name: "Conference Room", link: "/admin/conference", icon: <FaUsers /> },
    { name: "Banquet", link: "/admin/banquet", icon: <FaGlassCheers /> },
    { name: "Receipts", link: "/admin/receipts", icon: <FaReceipt /> },
  ];

  return (
    <aside className="sidebar">
      <div className="sidebar-top">
        <div className="sidebar-brand">
          <FaHotel size={28} color="#fff" />
          <span>Admin Panel</span>
        </div>
        <div className="sidebar-user">
          <FaUserCircle className="sidebar-user-icon" />
          <div className="sidebar-user-info">
            <p className="sidebar-user-name">{admin.name}</p>
            <p className="sidebar-user-email">{admin.email}</p>
          </div>
        </div>
      </div>

      <ul className="sidebar-menu">
        {menuItems.map((item) => (
          <li key={item.name}>
            <NavLink
              to={item.link}
              className={({ isActive }) =>
                `anchor-clear${isActive ? " active" : ""}`
              }
            >
              {item.icon} {item.name}
            </NavLink>
          </li>
        ))}
      </ul>
    </aside>
  );
};

export default Sidebar;