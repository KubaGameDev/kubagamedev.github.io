// JavaScript for Cat Juggling Game using Matter.js

// Matter.js Aliases
const Engine = Matter.Engine,
    World = Matter.World,
    Bodies = Matter.Bodies,
    Body = Matter.Body,
    Constraint = Matter.Constraint,
    Events = Matter.Events;

// Create canvas
const canvas = document.getElementById('gameCanvas');
const context = canvas.getContext('2d');
canvas.style.backgroundColor = 'transparent';

// Load images
const headImg = new Image();
const bodyImg = new Image();
const tailImg = new Image();
const imageScale = 0.1; // Adjust as needed

let imagesLoaded = 0;

headImg.onload = imageLoaded;
bodyImg.onload = imageLoaded;
tailImg.onload = imageLoaded;

headImg.src = 'images/jumpkat_head2.png';
bodyImg.src = 'images/jumpkat_body2.png';
tailImg.src = 'images/jumpkat_tail_segment.png';

let world, engine, ground, cats = [], counter = 0, gameActive = true, counterDisplay;

function imageLoaded() {
    imagesLoaded++;
    if (imagesLoaded === 3) {
        initGame();
    }
}

function initGame() {
    engine = Engine.create();
    world = engine.world;
    engine.timing.timeScale = 0.5;

    setCanvasSize();
    counterDisplay = document.getElementById('counter');

    createElements();
    setupMouseClick();
    
    (function render() {
        context.clearRect(0, 0, canvas.width, canvas.height);
        cats.forEach(cat => {
            drawCat(cat);
        });
        requestAnimationFrame(render);
    })();

    Events.on(engine, 'beforeUpdate', function () {
        cats.forEach(cat => {
            cat.tailSegments.forEach(segment => {
                limitRotation(segment, Math.PI / 9, -Math.PI / 9);
            });
            limitRotation(cat.head, -Math.PI / 3, Math.PI / 3);
        });
    });
    
    Engine.run(engine);
    window.addEventListener('resize', function () {
        setCanvasSize();
        updateWorldBounds();
    });
}

function setCanvasSize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}

function updateWorldBounds() {
    Body.setPosition(ground, { x: canvas.width / 2, y: canvas.height + 25 });
}

function createElements() {
    ground = Bodies.rectangle(canvas.width / 2, canvas.height + 25, canvas.width, 50, {
        isStatic: true,
        friction: 1.0,
        restitution: 0.1
    });
    World.add(world, ground);

    const leftWall = Bodies.rectangle(-25, canvas.height / 2, 50, canvas.height, { isStatic: true });
    const rightWall = Bodies.rectangle(canvas.width + 25, canvas.height / 2, 50, canvas.height, { isStatic: true });
    World.add(world, [leftWall, rightWall]);

    const CAT_COUNT = 3;
    for (let i = 0; i < CAT_COUNT; i++) {
        createCat();
    }
}

function createCat() {
    const x = Math.random() * (canvas.width - 100) + 50;
    const y = -200;

    const bodyWidth = bodyImg.width * imageScale;
    const bodyHeight = bodyImg.height * imageScale;

    const headWidth = headImg.width * imageScale;
    const headHeight = headImg.height * imageScale;

    const body = Bodies.rectangle(x, y, bodyWidth, bodyHeight, {
        friction: 0.3,
        restitution: 0.4,
        frictionAir: 0.05,
        mass: 20,
        collisionFilter: {
            group: -1
        }
    });

    const head = Bodies.rectangle(
        x,
        y - (bodyHeight * 0.75 + headHeight * 0.5),
        headWidth,
        headHeight,
        {
            friction: 1,
            restitution: 0.4,
            frictionAir: 0.5,
            mass: 2,
            collisionFilter: {
                group: -1
            }
        }
    );

    const neck = Constraint.create({
        bodyA: body,
        pointA: { x: 0, y: -bodyHeight * 0.4 },
        bodyB: head,
        pointB: { x: 0, y: headHeight * 0.4 },
        stiffness: 3,
        damping: 0.2,
        length: 0
    });

    const tailSegments = [];
    const segmentCount = 5;
    const segmentLength = 20 * imageScale * 12;
    let previousBody = body;

    for (let i = 0; i < segmentCount; i++) {
        const segmentY = y + (i + 0.5) * segmentLength;
        const segment = Bodies.circle(x, segmentY, 10 * imageScale, {
            friction: 0.1,
            restitution: 0.2,
            density: 0.75,
            collisionFilter: { group: -1 }
        });

        segment.initialAngle = segment.angle;

        const constraint = Constraint.create({
            bodyA: previousBody,
            pointA: { x: 0, y: i === 0 ? bodyHeight / 2 : 0 },
            bodyB: segment,
            pointB: { x: 0, y: 0 },
            stiffness: 0.4,
            length: segmentLength
        });
        World.add(world, [segment, constraint]);
        tailSegments.push(segment);
        previousBody = segment;
    }

    World.add(world, [body, head, neck]);
    cats.push({ body, head, tailSegments, active: true });
}

function setupMouseClick() {
    canvas.addEventListener('mousedown', function (event) {
        if (!gameActive) {
            resetGame();
        } else {
            const rect = canvas.getBoundingClientRect();
            const mousePosition = {
                x: event.clientX - rect.left,
                y: event.clientY - rect.top
            };
            cats.forEach(cat => {
                if (cat.active && isMouseOverCat(cat, mousePosition)) {
                    const forceMagnitude = 0.25 * cat.body.mass;
                    const angle = Math.atan2(cat.body.position.y - mousePosition.y, cat.body.position.x - mousePosition.x);
                    const force = {
                        x: Math.cos(angle) * forceMagnitude,
                        y: Math.sin(angle) * forceMagnitude
                    };
                    Body.applyForce(cat.body, cat.body.position, force);

                    if (cat.body.position.y < canvas.height - 50) {
                        counter++;
                        counterDisplay.textContent = counter;
                    }
                }
            });
        }
    });
}

function isMouseOverCat(cat, position) {
    const bodies = [cat.body];
    return bodies.some(body => Matter.Bounds.contains(body.bounds, position));
}

function drawCat(cat) {
    const imageScale = 0.1;

    context.save();
    context.translate(cat.body.position.x, cat.body.position.y);
    context.rotate(cat.body.angle);
    context.drawImage(
        bodyImg,
        -bodyImg.width * imageScale / 2,
        -bodyImg.height * imageScale / 2,
        bodyImg.width * imageScale,
        bodyImg.height * imageScale
    );
    context.restore();

    context.save();
    context.translate(cat.head.position.x, cat.head.position.y);
    context.rotate(cat.head.angle);
    context.drawImage(
        headImg,
        -headImg.width * imageScale / 2,
        -headImg.height * imageScale / 2,
        headImg.width * imageScale,
        headImg.height * imageScale
    );
    context.restore();

    if (tailImg.complete && cat.tailSegments.length > 1) {
        for (let i = 0; i < cat.tailSegments.length; i++) {
            const segment = cat.tailSegments[i];
            const prevSegment = (i === 0) ? cat.body : cat.tailSegments[i - 1];
            const dx = segment.position.x - prevSegment.position.x;
            const dy = segment.position.y - prevSegment.position.y;
            const angle = Math.atan2(dy, dx);

            context.save();
            context.translate(segment.position.x, segment.position.y);
            context.rotate(angle);
            context.drawImage(
                tailImg,
                -tailImg.width * imageScale * 0.5,
                -tailImg.height * imageScale * 0.5,
                tailImg.width * imageScale,
                tailImg.height * imageScale
            );
            context.restore();
        }
    }
}

function limitRotation(body, minAngleOffset, maxAngleOffset) {
    const minAngle = body.initialAngle + minAngleOffset;
    const maxAngle = body.initialAngle + maxAngleOffset;

    if (body.angle < minAngle) {
        Body.setAngle(body, minAngle);
        Body.setAngularVelocity(body, 0);
    } else if (body.angle > maxAngle) {
        Body.setAngle(body, maxAngle);
        Body.setAngularVelocity(body, 0);
    }
}
