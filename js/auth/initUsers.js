import { getDatabase, ref, set, get } from "https://www.gstatic.com/firebasejs/10.4.0/firebase-database.js";
import app from '../configFirebase.js';

const db = getDatabase(app);

// Updated authorized users sesuai requirement
const authorizedUsers = {
  'adminyoung': {
    password: 'admin',
    role: 'admin'
  },
  'supervisor': {
    password: 'svmlt116',
    role: 'supervisor'
  }
};

export async function initializeUsers() {
  const usersRef = ref(db, 'authorized_users');
  
  try {
    // Force update Firebase dengan data yang benar
    await set(usersRef, authorizedUsers);
    console.log('Users updated in Firebase:', authorizedUsers);
    return true;
  } catch (error) {
    console.error('Initialize users error:', error);
    return false;
  }
}

export async function loginUser(username, password) {
  try {
    console.log('Login attempt:', { username, password });
    
    const usersRef = ref(db, 'authorized_users');
    
    // Force update Firebase data first
    await set(usersRef, authorizedUsers);
    
    // Then get the updated data
    const snapshot = await get(usersRef);
    
    let users = authorizedUsers; // fallback to local users
    
    if (snapshot.exists()) {
      users = snapshot.val();
      console.log('Users from Firebase:', users);
    }
    
    // Check credentials
    if (users[username] && users[username].password === password) {
      console.log('Login successful for:', username);
      return {
        success: true,
        role: users[username].role,
        username: username
      };
    }
    
    console.log('Login failed - credentials mismatch');
    return {
      success: false,
      message: 'Username atau password salah'
    };
    
  } catch (error) {
    console.error('Login error:', error);
    
    // Fallback to local authentication if Firebase fails
    console.log('Using fallback authentication');
    const user = authorizedUsers[username];
    if (user && user.password === password) {
      return {
        success: true,
        username: username,
        role: user.role
      };
    }
    
    return {
      success: false,
      message: 'Terjadi kesalahan saat login. Silakan coba lagi.'
    };
  }
}
