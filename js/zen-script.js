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
      const isDarkMode = document.body.classList.contains('dark-mode');
      
      if (window.scrollY > 100) {
        if (isDarkMode) {
          header.style.background = 'rgba(22, 25, 46, 0.98)';
          header.style.boxShadow = '0 5px 20px rgba(0, 0, 0, 0.25)';
        } else {
          header.style.background = 'rgba(246, 245, 240, 0.98)';
          header.style.boxShadow = '0 5px 20px rgba(0, 0, 0, 0.1)';
        }
      } else {
        if (isDarkMode) {
          header.style.background = 'rgba(22, 25, 46, 0.95)';
          header.style.boxShadow = '0 2px 10px rgba(0, 0, 0, 0.2)';
        } else {
          header.style.background = 'rgba(246, 245, 240, 0.95)';
          header.style.boxShadow = '0 2px 10px rgba(0, 0, 0, 0.08)';
        }
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
      document.getElementById('deep-learning').classList.add('active');
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
        document.getElementById(interestId).classList.add('active');
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
    
    // Use a fallback approach that doesn't rely on external images
    petalImage.onerror = function() {
      // If image fails to load, we'll draw petals directly using canvas
      console.log("Petal image failed to load, using canvas drawing fallback");
      createPetals(true);
      createEmojis();
      animate();
    };
    
    // Try to load the image, but be prepared to fall back
    petalImage.src = 'new_images/Sakura_petal.png'; // Try local image first

    // Number of petals - increase for better effect
    const numberOfPetals = 120; // More petals
    const numberOfEmojis = 5;   // Keep emoji count the same

    // Enhanced Petal class with more natural movement
    class Petal {
      constructor(useFallback = false) {
        this.reset();
        this.useFallback = useFallback;
        // Generate colors in the pink/white range for cherry blossoms
        const hue = Math.random() * 20 + 340; // 340-360 (red/pink)
        const sat = Math.random() * 30 + 20;  // 20-50% saturation
        const lit = Math.random() * 20 + 70;  // 70-90% lightness
        this.color = `hsla(${hue}, ${sat}%, ${lit}%, ${Math.random() * 0.4 + 0.3})`;
        this.fallAmount = Math.random() * 10 + 5; // Different falling rates
      }

      reset() {
        // Start above the screen with randomized position
        this.x = Math.random() * canvas.width;
        this.y = -Math.random() * canvas.height * 0.5;
        this.size = Math.random() * 12 + 5;
        this.speed = Math.random() * 1.5 + 0.5;
        this.rotation = Math.random() * Math.PI * 2;
        this.rotationSpeed = (Math.random() - 0.5) * 0.03;
        this.wobbleSpeed = Math.random() * 0.03;
        this.wobbleSize = Math.random() * 0.5 + 1;
        this.swingFactor = Math.random() * 2 + 1;
        this.swingSpeed = Math.random() * 0.01 + 0.01;
        this.swingAngle = Math.random() * Math.PI * 2;
      }

      update() {
        // Realistic movement with gravity acceleration
        this.y += this.speed;
        this.speed += 0.005; // Slight acceleration (gravity)
        
        // Horizontal swinging (wind effect)
        this.swingAngle += this.swingSpeed;
        this.x += Math.sin(this.swingAngle) * this.swingFactor;
        
        // Realistic rotation as it falls
        this.rotation += this.rotationSpeed;
        
        // Add some wobble to the rotation
        this.rotation += Math.sin(this.y * this.wobbleSpeed) * 0.05;

        // Reset if out of view
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
        
        if (this.useFallback) {
          // Draw a more realistic petal shape using canvas
          ctx.beginPath();
          ctx.fillStyle = this.color;
          
          // Create a teardrop shape for more realistic petals
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
          
          // Add a subtle highlight
          ctx.beginPath();
          ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
          ctx.ellipse(this.size * 0.3, 0, this.size * 0.2, this.size * 0.1, 0, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.drawImage(petalImage, -this.size / 2, -this.size / 2, this.size, this.size);
        }
        
        ctx.restore();
      }
    }

    // Class representing a cherry blossom emoji
    class Emoji {
      constructor() {
        this.x = Math.random() * canvas.width;
        this.y = Math.random() * canvas.height;
        this.size = Math.random() * 20 + 20; // Emoji size
        this.speed = Math.random() * 1 + 0.5; // Emoji speed
      }

      update() {
        this.y += this.speed;
        this.x += windForce * (this.size / 15);
        
        if (this.y > canvas.height || this.x < -this.size || this.x > canvas.width + this.size) {
          this.y = -this.size;
          this.x = Math.random() * canvas.width;
          this.speed = Math.random() * 0.8 + 0.3;
        }
      }

      draw() {
        ctx.font = `${this.size}px sans-serif`;
        ctx.fillText("🌸", this.x, this.y);
      }
    }

    const emojis = [];

    // Create petals - Updated to use enhanced petal class
    const createPetals = (useFallback = false) => {
      for (let i = 0; i < numberOfPetals; i++) {
        petals.push(new Petal(useFallback));
      }
    };

    const createEmojis = () => {
      for (let i = 0; i < numberOfEmojis; i++) {
        emojis.push(new Emoji());
      }
    };

    // Add a gentle wind effect
    let windForce = 0;
    let windDirection = 1;
    
    const updateWind = () => {
      // Create a gentle breeze effect
      if (Math.random() < 0.01) {
        windDirection *= -1;
      }
      
      windForce += windDirection * 0.001;
      windForce = Math.max(-0.1, Math.min(0.1, windForce));
      
      setTimeout(updateWind, 100);
    }
    
    // Start wind simulation
    updateWind();

    // Enhanced animation with subtle fade
    const animate = () => {
      // Semi-transparent clear for trail effect
      ctx.fillStyle = 'rgba(15, 17, 24, 0.05)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      petals.forEach(petal => {
        petal.update();
        petal.draw();
      });

      emojis.forEach(emoji => {
        emoji.update();
        emoji.draw();
      });

      requestAnimationFrame(animate);
    };

    // Initialize only if image loads successfully
    petalImage.onload = () => {
      createPetals(false);
      createEmojis();
      animate();
    };

    // Handle window resize
    window.addEventListener('resize', () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    });
  };

  // Dark mode toggle - Updated to work without the checkbox element
  const darkModeToggle = () => {
    // Since we've removed the toggle, just set dark mode permanently
    document.body.classList.add('dark-mode');
    localStorage.setItem('darkMode', 'true');
    
    // Update header style for dark mode
    const header = document.querySelector('header');
    if (header) {
      if (window.scrollY > 100) {
        header.style.background = 'rgba(22, 25, 46, 0.98)';
        header.style.boxShadow = '0 5px 20px rgba(0, 0, 0, 0.25)';
      } else {
        header.style.background = 'rgba(22, 25, 46, 0.95)';
        header.style.boxShadow = '0 2px 10px rgba(0, 0, 0, 0.2)';
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
    
    // Add loading text if it doesn't exist
    if (!document.querySelector('.preloader-text')) {
      const loadingText = document.createElement('div');
      loadingText.className = 'preloader-text';
      loadingText.innerText = 'LOADING';
      preloader.appendChild(loadingText);
    }
  
    window.addEventListener('load', () => {
      setTimeout(() => {
        preloader.classList.add('hidden');
        setTimeout(() => {
          preloader.style.display = 'none';
        }, 500);
      }, 800); // Slightly longer delay for visual effect
    });
  };
  
  // Enhanced section transitions
  const enhanceSectionTransitions = () => {
    // Add a slight delay between animations to create a cascading effect
    const sections = document.querySelectorAll('section');
    
    sections.forEach((section, index) => {
      const fadeElements = section.querySelectorAll('.fade-in');
      
      fadeElements.forEach((element, elementIndex) => {
        element.style.transitionDelay = `${elementIndex * 0.1}s`;
      });
    });
  };

  // Initialize all functions
  const init = () => {
    // Initialize with a slight delay for smoother page load
    setTimeout(function() {
      navSlide();
      scrollAnimation();
      headerScroll();
      interestsInteraction();
      cherryBlossomAnimation();
      darkModeToggle();
      scrollProgress(); // New function
      enhancedPreloader(); // New function
      enhanceSectionTransitions(); // New function
    }, 100);
  };
  
  // Run when DOM is fully loaded
  document.addEventListener('DOMContentLoaded', init);