export type CareerStop = {
  club: string;
  seasons: string;
};

export type Achievement = {
  title: string;
  count: number;
};

export type Player = {
  id: string;
  name: string;
  nationality: string;
  careerPath: CareerStop[];
  achievements?: Achievement[];
};
