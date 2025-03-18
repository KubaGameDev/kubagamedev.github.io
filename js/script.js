// JavaScript for Handling Page Transitions and Game Logic

document.addEventListener("DOMContentLoaded", function() {
    const body = document.querySelector("body");
    setTimeout(() => {
        body.classList.remove("fade-in");
    }, 1000);
});

// Function to initiate fade-out before navigating to the next page
function slideTransition(direction) {
    const body = document.querySelector("body");
    body.classList.add("fade-out");
    setTimeout(() => {
        window.location.href = direction === "left" ? "ns_coming_soon.html" : "music.html";
    }, 1000);
}

// Event listeners for navigation prompts
document.addEventListener("DOMContentLoaded", function() {
    const leftTextBlock = document.querySelector("#left-text-block");
    const rightTextBlock = document.querySelector("#right-text-block");

    if (leftTextBlock) {
        leftTextBlock.addEventListener("click", () => slideTransition("left"));
    }
    if (rightTextBlock) {
        rightTextBlock.addEventListener("click", () => slideTransition("right"));
    }
});

// Function to handle resetting the game
function resetGame() {
    const counterDisplay = document.getElementById("counter");
    counterDisplay.textContent = 0;
    // Additional logic to reset the game can be added here
}

// Event listener for the reset button
document.addEventListener("DOMContentLoaded", function() {
    const resetButton = document.querySelector("#resetButton");
    if (resetButton) {
        resetButton.addEventListener("click", resetGame);
    }
});
