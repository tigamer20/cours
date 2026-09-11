#pragma once // Evite que ce fichier soit inclus plusieurs fois dans une meme compilation

class vecteur {
	private:
		int* _tab;	// Pointeur vers le premier element du tableau alloue dynamiquement (nullptr si vide)
		int _dim;	// Nombre d'elements actuellement contenus dans _tab

	public:
		vecteur();					// Constructeur sans parametre : cree un vecteur vide
		vecteur(int dim);				// Constructeur avec parametre : cree un vecteur de "dim" elements
		vecteur(const vecteur& source);		// Copieur : cree une copie independante (memoire separee) de "source"
		~vecteur();					// Destructeur : desalloue _tab pour eviter une fuite de memoire

		// Ajoutez des méthodes ici au fur et à mesure que
		// vous avancez votre laboratoire sur le vecteur.
};
