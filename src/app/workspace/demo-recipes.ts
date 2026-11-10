import type { LifeItem } from "@/server/domain/life-items";

type Recipe = Extract<LifeItem, { kind: "recipe" }>;
export const demoRecipes: (Recipe & { image: string; alt: string })[] = [
  {
    kind: "recipe", title: "Blueberry yogurt bowl", servings: 1, prepMinutes: 5, favorite: true,
    ingredients: "200 g plain Greek yogurt\n75 g blueberries\n30 g oat granola\n1 tsp honey",
    instructions: "1. Spoon the yogurt into a bowl.\n2. Wash the blueberries and scatter them over the yogurt.\n3. Add granola and drizzle with honey just before eating.",
    image: "/images/meals/berry-yogurt.webp", alt: "Greek yogurt topped with blueberries, oat granola and honey",
  },
  {
    kind: "recipe", title: "Chickpea & cucumber couscous", servings: 2, prepMinutes: 15, favorite: true,
    ingredients: "100 g dry instant couscous\n125 ml boiling water (or amount on pack)\n240 g canned chickpeas, drained and rinsed\n150 g cucumber, diced\n150 g cherry tomatoes, halved\n2 tbsp chopped parsley\n1 tbsp olive oil\n2 tbsp lemon juice\nBlack pepper to taste",
    instructions: "1. Put the couscous in a heatproof bowl, add the boiling water, cover and stand for the time on the package. Fluff with a fork.\n2. Fold in the chickpeas, cucumber, tomatoes and parsley.\n3. Stir in the olive oil and lemon juice. Season with black pepper. Divide into two portions.",
    image: "/images/meals/chickpea-couscous.webp", alt: "Couscous with chickpeas, cucumber, cherry tomatoes and parsley",
  },
  {
    kind: "recipe", title: "Lemon chicken grain bowl", servings: 2, prepMinutes: 35, favorite: true,
    ingredients: "300 g boneless chicken breast\n300 g cooked brown rice\n300 g broccoli florets\n1 tbsp olive oil\n1 lemon\n1 tbsp chopped parsley\nBlack pepper to taste",
    instructions: "1. Heat the oven to 425°F / 220°C. Put chicken and broccoli on a tray, keeping raw chicken juices away from ready-to-eat foods. Toss with oil, black pepper and juice from half the lemon.\n2. Roast for about 20–25 minutes, until a food thermometer reads at least 165°F / 74°C in the thickest part of the chicken. Time varies with thickness; use the temperature, not the clock.\n3. Heat cooked rice until steaming. Slice the chicken and divide rice, broccoli and chicken between two bowls. Finish with parsley and lemon wedges. Refrigerate leftovers promptly.",
    image: "/images/meals/lemon-chicken.webp", alt: "Sliced lemon chicken over brown rice with roasted broccoli and parsley",
  },
  {
    kind: "recipe", title: "Tomato & lentil soup", servings: 3, prepMinutes: 35, favorite: false,
    ingredients: "150 g dry red lentils, rinsed\n400 g canned chopped tomatoes\n1 onion, diced\n2 carrots, diced\n1 tbsp olive oil\n750 ml vegetable stock\n60 g spinach\n3 slices wholegrain bread",
    instructions: "1. Warm the oil in a saucepan. Cook onion and carrots over medium heat for 5 minutes.\n2. Add lentils, tomatoes and stock. Bring to a boil, then simmer gently for 20–25 minutes, stirring occasionally, until lentils and carrots are soft. Add water if needed.\n3. Stir in spinach until wilted. Divide into three portions and serve each with a slice of bread. Refrigerate leftovers promptly.",
    image: "/images/meals/tomato-lentils.webp", alt: "Tomato and red lentil soup with carrots and spinach, served with wholegrain bread",
  },
];

// Only display a dish photo while the saved ingredients still match its recipe.
// Renamed or edited meals fall back to the normal meal illustration.
export function recipePhotoFor(data: LifeItem) {
  if (data.kind !== "recipe" && data.kind !== "meal") return undefined;
  return demoRecipes.find(recipe => recipe.title === data.title && recipe.ingredients === data.ingredients);
}

export function savedDemoRecipe(recipe: typeof demoRecipes[number]): Recipe {
  return { kind: "recipe", title: recipe.title, ingredients: recipe.ingredients, instructions: recipe.instructions, servings: recipe.servings, prepMinutes: recipe.prepMinutes, favorite: recipe.favorite };
}
