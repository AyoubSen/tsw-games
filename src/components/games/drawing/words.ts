export const DRAWING_WORDS = [
  // Animals
  "elephant",
  "giraffe",
  "penguin",
  "butterfly",
  "octopus",
  "dolphin",
  "kangaroo",
  "crocodile",
  "flamingo",
  "turtle",
  "snake",
  "spider",
  "rabbit",
  "monkey",
  "bear",
  "lion",
  "zebra",
  "owl",
  "shark",
  "whale",

  // Objects
  "umbrella",
  "bicycle",
  "guitar",
  "rocket",
  "airplane",
  "camera",
  "telescope",
  "lighthouse",
  "windmill",
  "scissors",
  "hammer",
  "ladder",
  "keyboard",
  "headphones",
  "microphone",
  "balloon",
  "candle",
  "clock",
  "mirror",
  "glasses",

  // Food
  "pizza",
  "hamburger",
  "icecream",
  "banana",
  "watermelon",
  "cupcake",
  "popcorn",
  "sandwich",
  "spaghetti",
  "hotdog",

  // Actions/Verbs
  "swimming",
  "dancing",
  "sleeping",
  "cooking",
  "fishing",
  "skiing",
  "surfing",
  "climbing",
  "reading",
  "painting",

  // Places/Buildings
  "beach",
  "castle",
  "mountain",
  "hospital",
  "restaurant",
  "pyramid",
  "igloo",
  "volcano",
  "island",
  "bridge",

  // Nature
  "rainbow",
  "sunflower",
  "cactus",
  "mushroom",
  "tree",
  "cloud",
  "lightning",
  "waterfall",
  "moon",
  "star",

  // Vehicles
  "helicopter",
  "submarine",
  "motorcycle",
  "sailboat",
  "tractor",
  "train",
  "spaceship",
  "ambulance",
  "firetruck",
  "bus",

  // People/Characters
  "pirate",
  "astronaut",
  "wizard",
  "ninja",
  "robot",
  "mermaid",
  "superhero",
  "vampire",
  "ghost",
  "angel",
]

export function getRandomWord(): string {
  return DRAWING_WORDS[Math.floor(Math.random() * DRAWING_WORDS.length)]
}

export function getRandomWordExcluding(usedWords: string[]): string {
  const available = DRAWING_WORDS.filter((word) => !usedWords.includes(word))
  if (available.length === 0) {
    // If all words used, reset and pick any
    return DRAWING_WORDS[Math.floor(Math.random() * DRAWING_WORDS.length)]
  }
  return available[Math.floor(Math.random() * available.length)]
}
