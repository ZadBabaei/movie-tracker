import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FaUsers, FaFilm, FaUserPlus, FaArrowRight, FaCheck } from "react-icons/fa";
import { useUserStore } from "../store/useUserStore";
import { useModalStore } from "../store/useModalStore";
import { useGroupStore } from "../store/useGroupStore";
import Modal from "./Modal/Modal";
import "./OnboardingModal.css";

interface OnboardingModalProps {
  onComplete: () => void;
}

const steps = [
  {
    icon: <FaUsers size={40} />,
    title: "Create Your First Group",
    description: "Groups let you plan movie nights with friends. Start by creating one!",
    action: "Create a Group",
    color: "#d3ac6c",
  },
  {
    icon: <FaFilm size={40} />,
    title: "Discover Movies",
    description: "Search for movies you love and add them to your watchlist. You can suggest them to your group later!",
    action: "Browse Movies",
    color: "#e9c98d",
  },
  {
    icon: <FaUserPlus size={40} />,
    title: "Invite Friends",
    description: "Movie nights are better with friends. Invite them to your group and start planning together!",
    action: "Got It!",
    color: "#b8945a",
  },
];

const OnboardingModal: React.FC<OnboardingModalProps> = ({ onComplete }) => {
  const [currentStep, setCurrentStep] = useState(0);
  const { completeOnboarding } = useUserStore();
  const { openGroupNameModal } = useModalStore();
  const { openInviteFriendsModal } = useGroupStore();

  const handleAction = async () => {
    if (currentStep === 0) {
      // Open group creation modal
      openGroupNameModal();
    } else if (currentStep === 1) {
      // Navigate to home/search (just advance)
    } else if (currentStep === 2) {
      // Open invite modal if there's a group, otherwise just finish
      const { groupList } = useGroupStore.getState();
      if (groupList.length > 0) {
        openInviteFriendsModal();
      }
    }

    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      await completeOnboarding();
      onComplete();
    }
  };

  const handleSkip = async () => {
    await completeOnboarding();
    onComplete();
  };

  const step = steps[currentStep];

  return (
    <Modal
      isOpen
      onClose={handleSkip}
      bare
      closeOnEscape={false}
      closeOnOverlayClick={false}
      ariaLabel="Getting started"
    >
      <motion.div
        className="Onboarding-content"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: "spring", stiffness: 300, damping: 25 }}
      >
        {/* Progress dots */}
        <div className="Onboarding-progress">
          {steps.map((_, i) => (
            <div
              key={i}
              className={`Onboarding-dot ${i === currentStep ? "active" : ""} ${i < currentStep ? "done" : ""}`}
              style={{ background: i <= currentStep ? step.color : undefined }}
            />
          ))}
        </div>

        {/* Step content */}
        <AnimatePresence mode="wait">
          <motion.div
            key={currentStep}
            className="Onboarding-step"
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -30 }}
            transition={{ duration: 0.25 }}
          >
            <div className="Onboarding-icon" style={{ color: step.color }}>
              {step.icon}
            </div>
            <h2 className="Onboarding-title">{step.title}</h2>
            <p className="Onboarding-desc">{step.description}</p>
          </motion.div>
        </AnimatePresence>

        {/* Actions */}
        <div className="Onboarding-actions">
          <button
            className="Onboarding-action-btn"
            style={{ background: `linear-gradient(135deg, ${step.color}, ${step.color}dd)` }}
            onClick={handleAction}
          >
            <span>{currentStep === steps.length - 1 ? "Get Started" : step.action}</span>
            {currentStep === steps.length - 1 ? <FaCheck size={14} /> : <FaArrowRight size={14} />}
          </button>

          {currentStep < steps.length - 1 && (
            <button className="Onboarding-skip-btn" onClick={handleSkip}>
              Skip for now
            </button>
          )}
        </div>

        <p className="Onboarding-step-counter">
          Step {currentStep + 1} of {steps.length}
        </p>
      </motion.div>
    </Modal>
  );
};

export default OnboardingModal;
