import Image from "next/image";
import type { LifeItem } from "@/server/domain/life-items";
import { recipePhotoFor } from "./demo-recipes";
import s from "./demo-content.module.css";

export function MealPhoto({ data }: { data: LifeItem }) {
  const photo = recipePhotoFor(data);
  if (!photo) return null;
  return <figure className={s.mealPhoto}>
    <Image src={photo.image} alt={photo.alt} width={1200} height={800} sizes="(max-width: 760px) 90vw, (max-width: 1200px) 40vw, 560px" />
    <figcaption>AI-illustrated serving suggestion</figcaption>
  </figure>;
}
