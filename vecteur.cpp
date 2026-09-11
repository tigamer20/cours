#include "vecteur.h"

using namespace std;

// Completez ce fichiers et ajouter des methodes au fur et a
// mesure que vous avancez votre laboratoire sur le vecteur.

vecteur::vecteur() {
        _dim = 0;		// Un vecteur sans parametre est vide : aucun element
        _tab = nullptr;	// Le pointeur ne doit jamais rester non initialise, meme quand il ne pointe sur rien

}

vecteur::vecteur(int dim) {
	// TODO : assert(dim >= 0) pour intercepter une taille negative,
	// puis allouer _tab avec new int[dim] si dim > 0 (sinon _tab = nullptr),
	// et memoriser _dim = dim.
}

vecteur::~vecteur() {
        if (_tab != nullptr)	// On ne desalloue que s'il y a effectivement de la memoire allouee
            delete[] _tab;		// Libere le tableau alloue avec new[] (obligatoire, sinon fuite de memoire)
}

vecteur::vecteur(const vecteur& source) {
    _dim = source._dim;	// Le nouveau vecteur aura la meme taille que la source

    if (_dim > 0) {
        _tab = new int[_dim];	// On alloue notre PROPRE tableau (memoire separee de celle de "source")
        for (int i = 0; i < _dim; i++)
            *(_tab + i) = *(source._tab + i);	// Copie element par element, valeur par valeur (pas le pointeur)
    }
    else {
        _tab = nullptr;	// La source est vide, donc la copie l'est aussi
    }
}
