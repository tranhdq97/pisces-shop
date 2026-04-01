import client from './client'

export const getRecipes     = () => client.get('/recipes').then((r) => r.data)
export const getRecipe      = (menuItemId) => client.get(`/recipes/${menuItemId}`).then((r) => r.data)
export const getRecipeCost  = (menuItemId) => client.get(`/recipes/${menuItemId}/cost`).then((r) => r.data)
export const setRecipe      = (menuItemId, data) => client.put(`/recipes/${menuItemId}`, data).then((r) => r.data)
export const deleteRecipe   = (menuItemId) => client.delete(`/recipes/${menuItemId}`)
