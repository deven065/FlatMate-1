import { FaQuestionCircle, FaEnvelope, FaShieldAlt } from "react-icons/fa";

const Footer = () => {
    return (
    <footer className="w-full bg-[#1C2333] text-gray-400 px-6 py-3 flex justify-between items-center text-sm">
        <p>© {new Date().getFullYear()} FlatMate. All rights reserved.</p>
    </footer>
    );
};

export default Footer;
