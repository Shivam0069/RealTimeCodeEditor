// components/Register.js
"use client";
import Loader from "@/components/Loader";
import { useUser } from "@/context/userContext";
import { useRouter } from "next/navigation";
import { useState } from "react";
import logo from "../../../assets/code-sync.png";

import Image from "next/image";
const Register = () => {
  const [userData, setUserData] = useState({
    userName: "",
    email: "",
    password: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const { userRegister } = useUser();
  const router = useRouter();

  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setUserData({
      ...userData,
      [name]: value,
    });
  };

  const togglePasswordVisibility = () => {
    setShowPassword(!showPassword);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setLoading(true);
    const res = userRegister({ credentials: userData });
    if (res) {
      router.push("/profile");
    } else {
      toast.error("Error while registering");
      setLoading(false);
    }
    // You can add your registration logic here
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#1c1e29] text-[#fff]">
      {loading && <Loader />}
      <form
        onSubmit={handleSubmit}
        className="bg-white text-black p-8 rounded-lg shadow-md w-full md:max-w-md mx-4"
      >
        <div className="">
          <Image
            src={logo.src}
            alt="Code Sync Logo"
            width={200}
            height={40}
            priority
            style={{ filter: "invert(100%)" }}
          />
        </div>
        <h2 className="text-2xl font-bold mb-6  mt-4">Register With Us</h2>
        <div className="mb-4">
          <label className="block  text-sm font-bold mb-2" htmlFor="userName">
            Username
          </label>
          <input
            type="text"
            id="userName"
            name="userName"
            value={userData.userName}
            onChange={handleChange}
            className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-600 font-semibold"
            placeholder="Enter your username"
            required
          />
        </div>
        <div className="mb-4">
          <label className="block  text-sm font-bold mb-2" htmlFor="email">
            Email
          </label>
          <input
            type="email"
            id="email"
            name="email"
            value={userData.email}
            onChange={handleChange}
            className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-600 font-semibold"
            placeholder="Enter your email"
            required
          />
        </div>
        <div className="mb-6">
          <label className="block  text-sm font-bold mb-2" htmlFor="password">
            Password
          </label>
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              id="password"
              name="password"
              value={userData.password}
              onChange={handleChange}
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-600 font-semibold"
              placeholder="Enter your password"
              required
            />
            <button
              type="button"
              onClick={togglePasswordVisibility}
              className="absolute top-[50%] -translate-y-[50%] rounded-md right-2 w-16 py-1 flex items-center justify-center text-sm leading-5 bg-gray-600 text-white"
            >
              {showPassword ? "Hide" : "Show"}
            </button>
          </div>
        </div>
        <button
          type="submit"
          className="w-full bg-blue-500 text-white py-2 px-4 rounded-lg hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50"
        >
          Register
        </button>
        <p className="pt-2 text-sm">
          Already have a account ?{" "}
          <span
            onClick={() => {
              router.push("/login");
            }}
            className="text-blue-500 cursor-pointer"
          >
            Login
          </span>
        </p>
      </form>
    </div>
  );
};

export default Register;
