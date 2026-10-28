// Mobile navigation toggle
const navSlide = () => {
  const burger = document.querySelector('.burger');
  const nav = document.querySelector('nav ul');
  const navLinks = document.querySelectorAll('nav ul li');
  
  burger.addEventListener('click', () => {
    // Toggle Nav
    nav.classList.toggle('nav-active');
    
    // Toggle Burger
    burger.classList.toggle('toggle');
    
    // Animate Links
    navLinks.forEach((link, index) => {
      if (link.style.animation) {
        link.style.animation = '';
      } else {
        link.style.animation = `navLinkFade 0.5s ease forwards ${index / 7 + 0.3}s`;
      }
    });
  });
};

// Scroll animation for elements
const scrollAnimation = () => {
  const fadeElements = document.querySelectorAll('.fade-in');
  
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
      }
    });
  }, { threshold: 0.1 });
  
  fadeElements.forEach(element => {
    observer.observe(element);
  });
};

// Header scroll effect
const headerScroll = () => {
  const header = document.querySelector('header');
  
  window.addEventListener('scroll', () => {
    // Dark mode is always on, so no need for isDarkMode check here for colors
    // Colors are primarily controlled by CSS variables now.
    // This JS logic for direct style manipulation can be simplified or removed
    // if CSS handles all scroll-based changes.
    // For now, update to new dark mode colors.
    
    const scrolledHeaderBg = 'rgba(26, 26, 31, 0.98)'; // Sakura theme dark bg with alpha
    const defaultHeaderBg = 'rgba(26, 26, 31, 0.95)'; // Sakura theme dark bg with alpha
    const scrolledBoxShadow = '0 5px 20px rgba(0, 0, 0, 0.25)';
    const defaultBoxShadow = '0 2px 10px rgba(0, 0, 0, 0.2)';

    if (window.scrollY > 100) {
      header.style.background = scrolledHeaderBg;
      header.style.boxShadow = scrolledBoxShadow;
    } else {
      header.style.background = defaultHeaderBg;
      header.style.boxShadow = defaultBoxShadow;
    }
  });
};

// Research interests interaction
const interestsInteraction = () => {
  const interestItems = document.querySelectorAll('.interest-item-card');
  const interestDescriptions = document.querySelectorAll('.interest-description');
  
  // Show the first item by default
  if (interestItems.length > 0 && interestDescriptions.length > 0) {
    interestItems[0].classList.add('active');
    // Check if the element exists before trying to add 'active'
    const firstDesc = document.getElementById('deep-learning');
    if (firstDesc) {
      firstDesc.classList.add('active');
    }
  }
  
  interestItems.forEach(item => {
    item.addEventListener('click', () => {
      // Remove active class from all items
      interestItems.forEach(i => i.classList.remove('active'));
      interestDescriptions.forEach(d => d.classList.remove('active'));
      
      // Add active class to clicked item
      item.classList.add('active');
      
      // Show corresponding description
      const interestId = item.getAttribute('data-interest');
      const targetDesc = document.getElementById(interestId);
      if (targetDesc) {
          targetDesc.classList.add('active');
      }
    });
  });
};

// Cherry blossom animation - Enhanced with more realistic petals
const cherryBlossomAnimation = () => {
  const canvas = document.getElementById('cherry-blossom-canvas');
  if (!canvas) return;
  
  const ctx = canvas.getContext('2d');

  // Set canvas dimensions to match window
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  const petals = [];
  const petalImage = new Image();
  
  petalImage.onerror = function() {
    console.log("Petal image failed to load or not used, using canvas drawing fallback for petals.");
    createPetals(true); // Force fallback if image fails
    // createEmojis(); // Emojis are not part of the new request palette
    animate();
  };
  
  // Try to load the image, but be prepared to fall back
  // Assuming 'new_images/Sakura_petal.png' is a light pink petal that fits general theme
  petalImage.src = 'new_images/Sakura_petal.png'; 

  const numberOfPetals = 80; // Adjusted for performance and subtlety
  // const numberOfEmojis = 0; // Emojis removed for cleaner look with new palette

  class Petal {
    constructor(useFallback = false) {
      this.reset();
      this.useFallback = useFallback;
      // Cherry blossom colors: shades of light pink and white
      const hue = Math.random() * 15 + 345; // 345-360 (pinks)
      const sat = Math.random() * 40 + 50;  // 50-90% saturation (more vibrant)
      const lit = Math.random() * 20 + 75;  // 75-95% lightness (very light)
      this.color = `hsla(${hue}, ${sat}%, ${lit}%, ${Math.random() * 0.5 + 0.3})`; // Opacity
      this.fallAmount = Math.random() * 10 + 5; 
    }

    reset() {
      this.x = Math.random() * canvas.width;
      this.y = -Math.random() * canvas.height * 0.3 - 20; // Start slightly higher
      this.size = Math.random() * 10 + 4; // Slightly smaller petals
      this.speed = Math.random() * 1.2 + 0.4; // Slower fall
      this.rotation = Math.random() * Math.PI * 2;
      this.rotationSpeed = (Math.random() - 0.5) * 0.025;
      this.wobbleSpeed = Math.random() * 0.025;
      this.wobbleSize = Math.random() * 0.4 + 0.8;
      this.swingFactor = Math.random() * 1.5 + 0.5;
      this.swingSpeed = Math.random() * 0.008 + 0.008;
      this.swingAngle = Math.random() * Math.PI * 2;
    }

    update() {
      this.y += this.speed;
      this.speed += 0.003; 
      
      this.swingAngle += this.swingSpeed;
      this.x += Math.sin(this.swingAngle) * this.swingFactor;
      
      this.rotation += this.rotationSpeed;
      this.rotation += Math.sin(this.y * this.wobbleSpeed) * 0.04;

      if (this.y > canvas.height + this.size || 
          this.x < -this.size * 2 || 
          this.x > canvas.width + this.size * 2) {
        this.reset();
      }
    }

    draw() {
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.rotate(this.rotation);
      
      if (this.useFallback || !petalImage.complete || petalImage.naturalWidth === 0) { // Check if image actually loaded
        ctx.beginPath();
        ctx.fillStyle = this.color;
        
        ctx.moveTo(0, 0);
        ctx.bezierCurveTo(
          this.size * 0.5, -this.size * 0.5, 
          this.size, -this.size * 0.3, 
          this.size * 0.8, 0
        );
        ctx.bezierCurveTo(
          this.size, this.size * 0.3, 
          this.size * 0.5, this.size * 0.5, 
          0, 0
        );
        ctx.fill();
        
        ctx.beginPath();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.15)'; // Softer highlight
        ctx.ellipse(this.size * 0.3, 0, this.size * 0.2, this.size * 0.1, 0, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.drawImage(petalImage, -this.size / 2, -this.size / 2, this.size, this.size);
      }
      
      ctx.restore();
    }
  }

  // Emojis are removed for a cleaner aesthetic with the new palette
  // class Emoji { ... }
  // const emojis = [];

  const createPetals = (useFallback = false) => {
    petals.length = 0; // Clear existing petals before creating new ones
    for (let i = 0; i < numberOfPetals; i++) {
      petals.push(new Petal(useFallback));
    }
  };

  // const createEmojis = () => { ... }; // Removed

  let windForce = 0;
  let windDirection = 1;
  
  const updateWind = () => {
    if (Math.random() < 0.01) {
      windDirection *= -1;
    }
    windForce += windDirection * 0.0005; // Gentler wind
    windForce = Math.max(-0.05, Math.min(0.05, windForce));
    setTimeout(updateWind, 150); // Slower wind update
  }
  
  updateWind();

  const animate = () => {
    // Use a fillStyle derived from the new dark background for the trail effect
    ctx.fillStyle = 'rgba(26, 26, 31, 0.08)'; // Sakura theme dark bg with alpha
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    petals.forEach(petal => {
      petal.update();
      petal.draw();
    });

    // emojis.forEach(emoji => { ... }); // Removed

    requestAnimationFrame(animate);
  };

  petalImage.onload = () => {
    console.log("Petal image loaded successfully.");
    createPetals(false); // Image loaded, don't force fallback
    // createEmojis(); // Removed
    animate();
  };
  // If onload doesn't fire (e.g. image already cached and complete or error fires first), 
  // error handler should kick in or a check for `petalImage.complete` can be added.
  if (petalImage.complete && petalImage.naturalWidth !== 0 && !petals.length) {
      petalImage.onload(); // Manually trigger if already loaded
  }


  window.addEventListener('resize', () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    createPetals(petalImage.naturalWidth === 0); // Recreate petals on resize, respect fallback status
  });
};

// Dark mode toggle - Updated to work without the checkbox element
const darkModeToggle = () => {
  // Dark mode is permanently on.
  document.body.classList.add('dark-mode');
  // localStorage.setItem('darkMode', 'true'); // Not strictly necessary if always on

  // Header style update logic is now in headerScroll,
  // but ensure initial state is correct if headerScroll doesn't fire immediately.
  const header = document.querySelector('header');
  if (header) {
    const defaultHeaderBg = 'rgba(26, 26, 31, 0.95)'; // Sakura theme header bg
    const defaultBoxShadow = '0 2px 10px rgba(0, 0, 0, 0.2)'; // Match headerScroll
    if (window.scrollY <= 100) { // Check current scroll, apply default if at top
      header.style.background = defaultHeaderBg;
      header.style.boxShadow = defaultBoxShadow;
    }
  }
};

// Scroll progress indicator
const scrollProgress = () => {
  const progressBar = document.querySelector('.scroll-progress-bar');
  if (!progressBar) return;

  window.addEventListener('scroll', () => {
    const scrollTop = document.documentElement.scrollTop || document.body.scrollTop;
    const scrollHeight = document.documentElement.scrollHeight || document.body.scrollHeight;
    const clientHeight = document.documentElement.clientHeight || window.innerHeight;
    
    const scrolled = (scrollTop / (scrollHeight - clientHeight)) * 100;
    progressBar.style.width = scrolled + '%';
  });
};

// Enhanced preloader
const enhancedPreloader = () => {
  const preloader = document.querySelector('.preloader');
  if (!preloader) return;
  
  if (!document.querySelector('.preloader-text')) {
    const loadingText = document.createElement('div');
    loadingText.className = 'preloader-text';
    loadingText.innerText = 'LOADING'; // Or any other text
    preloader.appendChild(loadingText);
  }

  window.addEventListener('load', () => {
    setTimeout(() => {
      preloader.classList.add('hidden');
      setTimeout(() => {
        if (preloader) preloader.style.display = 'none';
      }, 500); // Match CSS transition
    }, 800); 
  });
};

// Enhanced section transitions
const enhanceSectionTransitions = () => {
  const sections = document.querySelectorAll('section');
  
  sections.forEach((section) => { // Removed index as it wasn't used
    const fadeElements = section.querySelectorAll('.fade-in');
    
    fadeElements.forEach((element, elementIndex) => {
      element.style.transitionDelay = `${elementIndex * 0.08}s`; // Slightly faster cascade
    });
  });
};

// Initialize all functions
const init = () => {
  setTimeout(function() {
    navSlide();
    scrollAnimation();
    headerScroll(); // Call this early to set initial header style
    interestsInteraction();
    cherryBlossomAnimation();
    darkModeToggle(); // Ensures dark mode class and potentially initial header
    scrollProgress();
    enhancedPreloader(); 
    enhanceSectionTransitions();
  }, 100); // Small delay
};

document.addEventListener('DOMContentLoaded', init);