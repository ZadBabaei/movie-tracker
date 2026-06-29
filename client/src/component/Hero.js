import "./Hero.css";

const Hero = ({
  backgroundImage,
  heroText,
  heroTextSub,
  height = "60vh",
  variant = "group",
}) => {
  return (
    <div className="hero-navbar" style={{ height }}>
      <div
        className="hero-banner parallax-hero"
        style={{ backgroundImage: `url(${backgroundImage})`, height }}
      >
        <div className="banner-overlay"></div>

        {variant === "group" && (
          <div className="group-title-container">
            <div className="group-title-bar">
              <h1 className="group-title-heading">{heroText}</h1>
              <p className="group-title-sub">{heroTextSub}</p>
            </div>
          </div>
        )}

        {variant === "home" && (
          <div className="home-title-container">
            <h1 className="main-heading">{heroText}</h1>
            <p className="sub-heading">{heroTextSub}</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Hero;
