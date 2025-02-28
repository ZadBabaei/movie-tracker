const movies = [
  {
    title: "The Grand Budapest Hotel",
    image: "https://image.tmdb.org/t/p/w500/4j0PNHkMr5ax3IA8tjtxcmPU3QT.jpg"
  },
  {
    title: "Interstellar",
    image: "https://image.tmdb.org/t/p/w500/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg"
  },
  {
    title: "The Dark Knight",
    image: "https://image.tmdb.org/t/p/w500/qJ2tW6WMUDux911r6m7haRef0WH.jpg"
  },
  {
    title: "Fight Club",
    image: "https://image.tmdb.org/t/p/w500/bptfVGEQuv6vDTIMVCHjJ9Dz8PX.jpg"
  },
  {
    title: "Pulp Fiction",
    image: "https://image.tmdb.org/t/p/w500/d5iIlFn5s0ImszYzBPb8JPIfbXD.jpg"
  },
  {
    title: "The Godfather",
    image: "https://image.tmdb.org/t/p/w500/3bhkrj58Vtu7enYsRolD1fZdja1.jpg"
  },
  {
    title: "The Shawshank Redemption",
    image: "https://image.tmdb.org/t/p/w500/q6y0Go1tsGEsmtFryDOJo3dEmqu.jpg"
  },
  {
    title: "Forrest Gump",
    image: "https://image.tmdb.org/t/p/w500/arw2vcBveWOVZr6pxd9XTd1TdQa.jpg"
  },
  {
    title: "The Matrix",
    image: "https://image.tmdb.org/t/p/w500/f89U3ADr1oiB1s9GkdPOEpXUk5H.jpg"
  },
  {
    title: "The Lord of the Rings: The Return of the King",
    image: "https://image.tmdb.org/t/p/w500/rCzpDGLbOoPwLjy3OAm5NUPOTrC.jpg"
  },
  {
    title: "The Silence of the Lambs",
    image: "https://image.tmdb.org/t/p/w500/rplLJ2hPcOQmkFhTqUte0MkEaO2.jpg"
  },
  {
    title: "Gladiator",
    image: "https://image.tmdb.org/t/p/w500/ty8TGRuvJLPUmAR1H1nRIsgwvim.jpg"
  },
  {
    title: "Django Unchained",
    image: "https://image.tmdb.org/t/p/w500/2oZklIzUbvZXXzIFzv7Hi68d6xf.jpg"
  },
  {
    title: "Goodfellas",
    image: "https://image.tmdb.org/t/p/w500/aKuFiU82s5ISJpGZp7YkIr3kCUd.jpg"
  },
  {
    title: "Parasite",
    image: "https://image.tmdb.org/t/p/w500/7IiTTgloJzvGI1TAYymCfbfl3vT.jpg"
    },
    {
    title: "Avatar",
    image: "https://image.tmdb.org/t/p/w500/kyeqWdyUXW608qlYkRqosgbbJyK.jpg",
  },
  {
    title: "Titanic",
    image: "https://image.tmdb.org/t/p/original/9xjZS2rlVxm8SFx8kPC3aIGCOYQ.jpg",
  },
  {
    title: "Joker",
    image: "https://image.tmdb.org/t/p/w500/udDclJoHjfjb8Ekgsd4FDteOkCU.jpg",
  },
  {
    title: "Avengers: Endgame",
    image: "https://image.tmdb.org/t/p/w500/or06FN3Dka5tukK1e9sl16pB3iy.jpg",
  },
  {
    title: "Spider-Man: No Way Home",
    image: "https://image.tmdb.org/t/p/w500/1g0dhYtq4irTY1GPXvft6k4YLjm.jpg",
  },
  {
    title: "Doctor Strange in the Multiverse of Madness",
    image: "https://image.tmdb.org/t/p/w500/wRnbWt44nKjsFPrqSmwYki5vZtF.jpg",
  },
  {
    title: "Black Panther",
    image: "https://image.tmdb.org/t/p/w500/uxzzxijgPIY7slzFvMotPv8wjKA.jpg",
  },
  {
    title: "Guardians of the Galaxy",
    image: "https://image.tmdb.org/t/p/w500/r7vmZjiyZw9rpJMQJdXpjgiCOk9.jpg",
  },
  {
    title: "Thor: Ragnarok",
    image: "https://image.tmdb.org/t/p/w500/kaIfm5ryEOwYg8mLbq8HkPuM1Fo.jpg",
  },
  {
    title: "Deadpool",
    image: "https://image.tmdb.org/t/p/w500/fSRb7vyIP8rQpL0I47P3qUsEKX3.jpg",
  },
  {
    title: "The Batman",
    image: "https://image.tmdb.org/t/p/w500/74xTEgt7R36Fpooo50r9T25onhq.jpg",
  },
  {
    title: "Dune",
    image: "https://image.tmdb.org/t/p/w500/d5NXSklXo0qyIYkgV94XAgMIckC.jpg",
  },
  {
    title: "Everything Everywhere All at Once",
    image: "https://image.tmdb.org/t/p/w500/w3LxiVYdWWRvEVdn5RYq6jIqkb1.jpg",
  },
  {
    title: "Oppenheimer",
    image: "https://image.tmdb.org/t/p/w500/ptpr0kGAckfQkJeJIt8st5dglvd.jpg",
  },
  {
    title: "Mission: Impossible - Fallout",
    image: "https://image.tmdb.org/t/p/w500/AkJQpZp9WoNdj7pLYSj1L0RcMMN.jpg",
  },
  {
    title: "Top Gun: Maverick",
    image: "https://image.tmdb.org/t/p/w500/62HCnUTziyWcpDaBO2i1DX17ljH.jpg",
  },
  {
    title: "Mad Max: Fury Road",
    image: "https://image.tmdb.org/t/p/w500/8tZYtuWezp8JbcsvHYO0O46tFbo.jpg",
  },
  {
    title: "La La Land",
    image: "https://image.tmdb.org/t/p/w500/uDO8zWDhfWwoFdKS4fzkUJt0Rf0.jpg",
  },

  {
    title: "Inception",
    image: "https://image.tmdb.org/t/p/w500/9gk7adHYeDvHkCSEqAvQNLV5Uge.jpg",
  },

  {
    title: "The Irishman",
    image: "https://image.tmdb.org/t/p/w500/mbm8k3GFhXS0ROd9AD1gqYbIFbM.jpg",
    },
   

    {
        title: "The Hateful Eight",
        image: "https://image.tmdb.org/t/p/w500/nZeKw2oDiODgnht9OrohB2jBhjq.jpg",
    },

    {
        title: "Blade Runner 2049",
        image: "https://image.tmdb.org/t/p/w500/aMpyrCizvSdc0UIMblJ1srVgAEF.jpg",
    },
    {
        title: "Logan",
        image: "https://image.tmdb.org/t/p/w500/gGBu0hKw9BGddG8RkRAMX7B6NDB.jpg",
    },
    {
        title: "The Shape of Water",
        image: "https://image.tmdb.org/t/p/w500/k4FwHlMhuRR5BISY2Gm2QZHlH5Q.jpg",
    },
 
    {
        title: "Lady Bird",
        image: "https://image.tmdb.org/t/p/w500/iySFtKLrWvVzXzlFj7x1zalxi5G.jpg",
    },
    {
        title: "Get Out",
        image: "https://image.tmdb.org/t/p/w500/tFXcEccSQMf3lfhfXKSU9iRBpa3.jpg",
    },
    {
        title: "Moonlight",
        image: "https://image.tmdb.org/t/p/original/rJFesqMQiUSBvM1fWENJHx9ws6o.jpg",
    },

    {
        title: "Arrival",
        image: "https://image.tmdb.org/t/p/w500/x2FJsf1ElAgr63Y3PNPtJrcmpoe.jpg",
    },
 
    {
        title: "Mad Max: Fury Road",
        image: "https://image.tmdb.org/t/p/w500/8tZYtuWezp8JbcsvHYO0O46tFbo.jpg",
    },
    {
        title: "The Martian",
        image: "https://image.tmdb.org/t/p/original/5BHuvQ6p9kfc091Z8RiFNhCwL4b.jpg",
    },
    {
        title: "Inside Out",
        image: "https://image.tmdb.org/t/p/w500/lRHE0vzf3oYJrhbsHXjIkF4Tl5A.jpg",
    }
];
export default movies;