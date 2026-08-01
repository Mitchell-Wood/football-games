export type CareerStop = {
  club: string;
  seasons: string;
};

export type Player = {
  id: string;
  name: string;
  nationality: string;
  careerPath: CareerStop[];
};
