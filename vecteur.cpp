#include "vecteur.h"

using namespace std;

// Complétez ce fichiers et ajouter des méthodes au fur et à
// mesure que vous avancez votre laboratoire sur le vecteur.

vecteur::vecteur() {
        _dim = 0;
        _tab = nullptr;

}

vecteur::vecteur(int dim) {

}

vecteur::~vecteur() {
        if (_tab != nullptr)
            delete[] _tab;
}