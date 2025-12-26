// ==========================================
// BADRE ALLOUL PORTFOLIO — INTERACTIVE JS
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
    initCursorGlow();
    initNavigation();
    initScrollAnimations();
    initStaggeredAnimations();
});

// ==========================================
// CURSOR GLOW EFFECT
// ==========================================
function initCursorGlow() {
    const glow = document.querySelector('.cursor-glow');
    if (!glow || window.innerWidth < 768) {
        if (glow) glow.style.display = 'none';
        return;
    }
    
    let mouseX = 0, mouseY = 0;
    let glowX = 0, glowY = 0;
    
    document.addEventListener('mousemove', (e) => {
        mouseX = e.clientX;
        mouseY = e.clientY;
    });
    
    function animate() {
        glowX += (mouseX - glowX) * 0.06;
        glowY += (mouseY - glowY) * 0.06;
        glow.style.left = glowX + 'px';
        glow.style.top = glowY + 'px';
        requestAnimationFrame(animate);
    }
    
    animate();
}

// ==========================================
// NAVIGATION
// ==========================================
function initNavigation() {
    const toggle = document.querySelector('.nav-toggle');
    const menu = document.querySelector('.nav-menu');
    const links = document.querySelectorAll('.nav-link');
    const navbar = document.querySelector('.navbar');
    
    // Mobile toggle
    if (toggle && menu) {
        toggle.addEventListener('click', () => {
            menu.classList.toggle('active');
            toggle.classList.toggle('active');
        });
        
        links.forEach(link => {
            link.addEventListener('click', () => {
                menu.classList.remove('active');
                toggle.classList.remove('active');
            });
        });
    }
    
    // Navbar background on scroll
    let lastScroll = 0;
    window.addEventListener('scroll', () => {
        const currentScroll = window.scrollY;
        
        if (currentScroll > 50) {
            navbar.style.background = 'rgba(12, 12, 15, 0.95)';
            navbar.style.borderColor = 'rgba(42, 42, 50, 0.8)';
        } else {
            navbar.style.background = 'rgba(12, 12, 15, 0.8)';
            navbar.style.borderColor = 'rgba(42, 42, 50, 0.5)';
        }
        
        lastScroll = currentScroll;
    });
    
    // Active link highlighting
    const sections = document.querySelectorAll('section[id]');
    window.addEventListener('scroll', () => {
        let current = '';
        sections.forEach(section => {
            const sectionTop = section.offsetTop - 120;
            const sectionHeight = section.offsetHeight;
            if (scrollY >= sectionTop && scrollY < sectionTop + sectionHeight) {
                current = section.getAttribute('id');
            }
        });
        
        links.forEach(link => {
            link.classList.remove('active');
            if (link.getAttribute('href') === `#${current}`) {
                link.classList.add('active');
            }
        });
    });
}

// ==========================================
// SCROLL ANIMATIONS
// ==========================================
function initScrollAnimations() {
    const animatedElements = document.querySelectorAll(
        '.exp-card, .project-card, .stack-category, .article-card, .edu-card, .contact-card'
    );
    
    const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            if (entry.isIntersecting) {
                entry.target.classList.add('animate-in');
                observer.unobserve(entry.target);
            }
        });
    }, {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    });
    
    animatedElements.forEach(el => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(24px)';
        el.style.transition = 'opacity 0.6s cubic-bezier(0.22, 1, 0.36, 1), transform 0.6s cubic-bezier(0.22, 1, 0.36, 1)';
        observer.observe(el);
    });
    
    // Add CSS class for animation
    const style = document.createElement('style');
    style.textContent = `
        .animate-in {
            opacity: 1 !important;
            transform: translateY(0) !important;
        }
    `;
    document.head.appendChild(style);
}

// ==========================================
// STAGGERED ANIMATIONS
// ==========================================
function initStaggeredAnimations() {
    // Stagger experience cards
    const expCards = document.querySelectorAll('.exp-card');
    expCards.forEach((card, index) => {
        card.style.transitionDelay = `${index * 100}ms`;
    });
    
    // Stagger education cards
    const eduCards = document.querySelectorAll('.edu-card');
    eduCards.forEach((card, index) => {
        card.style.transitionDelay = `${index * 100}ms`;
    });
    
    // Stagger project cards
    const projectCards = document.querySelectorAll('.project-card');
    projectCards.forEach((card, index) => {
        card.style.transitionDelay = `${index * 80}ms`;
    });
    
    // Stagger stack categories
    const stackCats = document.querySelectorAll('.stack-category');
    stackCats.forEach((cat, index) => {
        cat.style.transitionDelay = `${index * 60}ms`;
    });
}

// ==========================================
// SMOOTH SCROLL
// ==========================================
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function(e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            target.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }
    });
});

// ==========================================
// LOGO FALLBACK HANDLING
// ==========================================
document.querySelectorAll('.edu-logo, .company-logo').forEach(img => {
    img.addEventListener('error', function() {
        // If the image fails to load, show a placeholder icon
        this.style.display = 'none';
        const wrapper = this.closest('.edu-logo-wrapper, .exp-logo-wrapper');
        if (wrapper && !wrapper.querySelector('i')) {
            wrapper.innerHTML = '<i class="fas fa-graduation-cap" style="font-size: 2rem; color: var(--accent);"></i>';
        }
    });
});
