#include "vecteur.h"

using namespace std;

// Completez ce fichiers et ajouter des methodes au fur et a
// mesure que vous avancez votre laboratoire sur le vecteur.

vecteur::vecteur() {
	// Constructeur sans parametre : le vecteur cree est vide.
	_dim = 0;		// Aucun element
	_tab = nullptr;	// Aucune memoire allouee ; le pointeur ne doit jamais rester non initialise
}

vecteur::vecteur(int dim) {
	// Constructeur avec parametre : encore a implementer.
	//
	// Ce qu'il reste a faire ici :
	// 1) assert(dim >= 0);
	//    -> Fait planter volontairement le programme si on demande une taille negative
	//       (un vecteur de taille -1 n'a pas de sens et new[] l'interdit de toute facon).
	//
	// 2) if (dim > 0) { _tab = new int[dim]; } else { _tab = nullptr; }
	//    -> On ne peut PAS faire new int[0] (interdit par l'enonce), donc il faut
	//       distinguer le cas dim == 0 (vecteur vide valide) du cas dim > 0 (vraie allocation).
	//    -> Les "dim" entiers alloues ne sont pas initialises (contiendront des valeurs
	//       "garbage" au depart, c'est normal et attendu par le jeu d'essais).
	//
	// 3) _dim = dim;
	//    -> Enregistrer la taille demandee dans l'attribut _dim.
}

vecteur::~vecteur() {
	// Destructeur : on libere la memoire allouee dynamiquement (s'il y en a).
	if (_tab != nullptr)	// Rien a desallouer si le vecteur est deja vide
		delete[] _tab;		// delete[] car alloue avec new[] (obligatoire, sinon fuite de memoire)
}

vecteur::vecteur(const vecteur& source) {
	// Copieur : construit une copie INDEPENDANTE de "source" (memoire separee).
	_dim = source._dim;	// Le nouveau vecteur aura la meme taille que la source

	if (_dim > 0) {
		_tab = new int[_dim];	// On alloue notre PROPRE tableau (pas celui de "source")
		for (int i = 0; i < _dim; i++)
			// Copie element par element, valeur par valeur (jamais le pointeur lui-meme)
			*(_tab + i) = *(source._tab + i);
	}
	else {
		_tab = nullptr;	// La source est vide, donc la copie l'est aussi
	}
}

void vecteur::print(ostream& output) const {
	// Affiche chaque element du vecteur suivi d'un espace, dans le flux "output".
	for (int i = 0; i < _dim; i++) {
		// Si _dim == 0 (vecteur vide), la boucle ne s'execute jamais :
		// rien ne s'affiche, ce qui est le comportement attendu.
		output << *(_tab + i) << ' ';
	}
}

ostream& operator<<(ostream& output, const vecteur& v) {
	// Delegue l'affichage a print(), comme demande par l'enonce.
	v.print(output);
	return output;	// Retourne le flux pour permettre le chainage : cout << v1 << v2;
}
