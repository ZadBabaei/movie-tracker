
import "./Hero.css";

const HeroNavbar = ({ backgroundImage, heroText }) => {

  return (
    <div className="hero-navbar">
        <div className="hero-banner" style={{ backgroundImage: `url(${backgroundImage})` }} data-bg-image={backgroundImage}>
                <div className="banner-overlay" />
                          {heroText && <h1 className="banner-text">{heroText}</h1>}
        </div>
    </div>
    
  

  );
};

export default HeroNavbar;
